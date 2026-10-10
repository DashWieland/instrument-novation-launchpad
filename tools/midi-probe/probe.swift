import CoreMIDI
import Foundation
func dname(_ e: MIDIEndpointRef) -> String { var s: Unmanaged<CFString>?; MIDIObjectGetStringProperty(e, kMIDIPropertyDisplayName, &s); return (s?.takeRetainedValue() as String?) ?? "" }
var client = MIDIClientRef(); MIDIClientCreate("probe" as CFString, nil, nil, &client)
var out = MIDIPortRef(); MIDIOutputPortCreate(client, "out" as CFString, &out)
var inp = MIDIPortRef()
let t0 = Date()
MIDIInputPortCreateWithBlock(client, "in" as CFString, &inp) { list, _ in
  var p = list.pointee.packet
  for _ in 0..<list.pointee.numPackets {
    let bytes = withUnsafeBytes(of: p.data) { Array($0.prefix(Int(p.length))) }
    print(String(format: "%.2fs  in: ", Date().timeIntervalSince(t0)) + bytes.map { String(format: "%02X", $0) }.joined(separator: " "))
    p = MIDIPacketNext(&p).pointee
  }
}
var dest: MIDIEndpointRef = 0
for i in 0..<MIDIGetNumberOfDestinations() where dname(MIDIGetDestination(i)) == "Launchpad Mini" { dest = MIDIGetDestination(i) }
for i in 0..<MIDIGetNumberOfSources() where dname(MIDIGetSource(i)) == "Launchpad Mini" { MIDIPortConnectSource(inp, MIDIGetSource(i), nil) }
func send(_ b: [UInt8]) { var list = MIDIPacketList(); var p = MIDIPacketListInit(&list); p = MIDIPacketListAdd(&list, 1024, p, 0, b.count, b); MIDISend(out, dest, &list) }
print("device inquiry ->"); send([0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7])
RunLoop.current.run(until: Date().addingTimeInterval(1.0))
print("scroll text ->")
send([0xF0, 0x00, 0x20, 0x29, 0x09, 0x3F, 0x07] + Array("hi dash".utf8) + [0xF7])   // amber, speed 7
RunLoop.current.run(until: Date().addingTimeInterval(9.0))
print("done")
