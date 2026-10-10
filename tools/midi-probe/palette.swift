import CoreMIDI
import Foundation
var client = MIDIClientRef(); MIDIClientCreate("probe" as CFString, nil, nil, &client)
var out = MIDIPortRef(); MIDIOutputPortCreate(client, "out" as CFString, &out)
var dest: MIDIEndpointRef = 0
for i in 0..<MIDIGetNumberOfDestinations() {
  var s: Unmanaged<CFString>?; let e = MIDIGetDestination(i)
  MIDIObjectGetStringProperty(e, kMIDIPropertyDisplayName, &s)
  if (s?.takeRetainedValue() as String?) == "Launchpad Mini" { dest = e }
}
guard dest != 0 else { print("no Launchpad"); exit(1) }
func send(_ b: [UInt8]) {
  var list = MIDIPacketList(); var p = MIDIPacketListInit(&list)
  p = MIDIPacketListAdd(&list, 1024, p, 0, b.count, b)
  MIDISend(out, dest, &list)
}
send([0xB0, 0x00, 0x00])            // reset (Launchpad S/Mini protocol)
usleep(50_000)
// 16-colour palette: red brightness 0-3 across, green 0-3 up; 2x2 blocks
for r in 0..<8 { for c in 0..<8 {
  let red = UInt8(c / 2), green = UInt8((7 - r) / 2)
  send([0x90, UInt8(16 * r + c), 16 * green + red + 12])
  usleep(2_000)
}}
// right-hand round buttons (col 8) amber, top round buttons (CC 104-111) green
for r in 0..<8 { send([0x90, UInt8(16 * r + 8), 0x3F]); usleep(2_000) }
for c in 0..<8 { send([0xB0, UInt8(104 + c), 0x3C]); usleep(2_000) }
usleep(300_000)
print("sent")
