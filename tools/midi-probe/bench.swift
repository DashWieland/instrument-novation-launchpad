// Throughput: how fast does the Mini consume full-surface frames?
// Sends N double-buffered frames, then a device inquiry; the Mini answers in
// order, so time-to-reply bounds how long it took to digest the frames.
import CoreMIDI
import Foundation
func dname(_ e: MIDIEndpointRef) -> String { var s: Unmanaged<CFString>?; MIDIObjectGetStringProperty(e, kMIDIPropertyDisplayName, &s); return (s?.takeRetainedValue() as String?) ?? "" }
var client = MIDIClientRef(); MIDIClientCreate("bench" as CFString, nil, nil, &client)
var out = MIDIPortRef(); MIDIOutputPortCreate(client, "out" as CFString, &out)
var inp = MIDIPortRef()
var replyAt: Date? = nil
MIDIInputPortCreateWithBlock(client, "in" as CFString, &inp) { list, _ in
  let p = list.pointee.packet
  if p.length > 0 && p.data.0 == 0xF0 && replyAt == nil { replyAt = Date() }
}
var dest: MIDIEndpointRef = 0
for i in 0..<MIDIGetNumberOfDestinations() where dname(MIDIGetDestination(i)) == "Launchpad Mini" { dest = MIDIGetDestination(i) }
for i in 0..<MIDIGetNumberOfSources() where dname(MIDIGetSource(i)) == "Launchpad Mini" { MIDIPortConnectSource(inp, MIDIGetSource(i), nil) }
guard dest != 0 else { print("no Launchpad"); exit(1) }
func send(_ b: [UInt8]) {
  let size = 64 + b.count * 2
  let buf = UnsafeMutableRawPointer.allocate(byteCount: size, alignment: 8); defer { buf.deallocate() }
  let list = buf.assumingMemoryBound(to: MIDIPacketList.self)
  var p = MIDIPacketListInit(list); p = MIDIPacketListAdd(list, size, p, 0, b.count, b)
  MIDISend(out, dest, list)
}
let RED: UInt8 = 3, GREEN: UInt8 = 0x30           // flags 0 = write update buffer only
func pattern(_ k: Int) -> [UInt8] { (0..<80).map { i in ((i + i / 8 + k) % 2 == 0) ? RED : GREEN } }

func run(_ label: String, frames: Int, rapid: Bool) {
  send([0xB0, 0, 0]); send([0xB0, 0, 0x34]); usleep(200_000)
  replyAt = nil
  let t0 = Date()
  for k in 0..<frames {
    let f = pattern(k); var msg: [UInt8] = []
    if rapid { for i in stride(from: 0, to: 80, by: 2) { msg += [0x92, f[i], f[i + 1]] } }
    else {
      for i in 0..<64 { msg += [0x90, UInt8(16 * (i / 8) + i % 8), f[i]] }
      for y in 0..<8 { msg += [0x90, UInt8(16 * y + 8), f[64 + y]] }
      for x in 0..<8 { msg += [0xB0, UInt8(104 + x), f[72 + x]] }
    }
    msg += [0xB0, 0, k % 2 == 0 ? 0x31 : 0x34]       // swap (+copy)
    send(msg)
  }
  send([0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7])
  let deadline = Date().addingTimeInterval(30)
  while replyAt == nil && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.005)) }
  guard let r = replyAt else { print("\(label): no reply within 30 s"); return }
  let dt = r.timeIntervalSince(t0), msgs = frames * (rapid ? 41 : 81)
  print(String(format: "%@: %d frames in %.3f s -> %.1f frames/s, %.0f msgs/s", label, frames, dt, Double(frames) / dt, Double(msgs) / dt))
}
// baseline: inquiry alone
replyAt = nil; let b0 = Date(); send([0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7])
while replyAt == nil { RunLoop.current.run(until: Date().addingTimeInterval(0.002)) }
print(String(format: "inquiry round trip alone: %.1f ms", replyAt!.timeIntervalSince(b0) * 1000))
run("rapid update (40 msgs + swap)", frames: 200, rapid: true)
run("per-LED      (80 msgs + swap)", frames: 200, rapid: false)
send([0xB0, 0, 0]); usleep(100_000)
