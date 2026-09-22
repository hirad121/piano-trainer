import type { NoteEvent, Song } from '../midi/types'

const E = 0.25 // eighth note, seconds - fast tempo, the difficulty jump from Two-Hand Waltz
const H = 1.0 // half note, seconds

function n(midi: number, time: number, duration: number): NoteEvent {
  return { midi, time, duration, velocity: 0.8, hand: 'right' }
}

// Original short piece, Advanced tier: a fast one-octave-plus scale run up and back down.
// The default QWERTY window at octave shift 0 only reaches MIDI 77 (F5) - this run climbs
// to G5 (79), so clearing it requires shifting up an octave (X) mid-run and back down (Z)
// on the way back, on top of the faster tempo. That's the intended extra challenge over
// Two-Hand Waltz, which stays entirely within the default window.
const notes: NoteEvent[] = [
  // ascending: C4 D4 E4 F4 G4 A4 B4 C5 D5 E5 F5 G5
  n(60, 0.0, E), n(62, 0.25, E), n(64, 0.5, E), n(65, 0.75, E),
  n(67, 1.0, E), n(69, 1.25, E), n(71, 1.5, E), n(72, 1.75, E),
  n(74, 2.0, E), n(76, 2.25, E), n(77, 2.5, E), n(79, 2.75, E),
  // descending: F5 E5 D5 C5 B4 A4 G4 F4 E4 D4 C4(held)
  n(77, 3.0, E), n(76, 3.25, E), n(74, 3.5, E), n(72, 3.75, E),
  n(71, 4.0, E), n(69, 4.25, E), n(67, 4.5, E), n(65, 4.75, E),
  n(64, 5.0, E), n(62, 5.25, E), n(60, 5.5, H),
]

export const fastEtude: Song = {
  name: 'Fast Etude',
  notes,
  durationSeconds: 6.5,
}
