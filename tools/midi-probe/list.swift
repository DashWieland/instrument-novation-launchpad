import CoreMIDI
func name(_ e: MIDIEndpointRef) -> String {
  var s: Unmanaged<CFString>?
  MIDIObjectGetStringProperty(e, kMIDIPropertyDisplayName, &s)
  return (s?.takeRetainedValue() as String?) ?? "?"
}
print("Sources:"); for i in 0..<MIDIGetNumberOfSources() { print("  ", name(MIDIGetSource(i))) }
print("Destinations:"); for i in 0..<MIDIGetNumberOfDestinations() { print("  ", name(MIDIGetDestination(i))) }
