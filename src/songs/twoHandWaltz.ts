import type { Hand, NoteEvent, Song } from '../midi/types'

const Q = 0.5 // quarter note, seconds
const H = 1.0 // half note, seconds

function n(midi: number, time: number, duration: number, hand: Hand = 'right'): NoteEvent {
  return { midi, time, duration, velocity: 0.8, hand }
}

// Original short piece, Intermediate tier: introduces two-hand chords (simultaneous
// left+right notes at the same `time`, reusing the existing chord-matching support in
// PracticeEngine's wait-group logic - no new mechanism needed) on top of the single-line
// melodies of the Beginner songs. Both hands stay within the default reachable QWERTY
// window (no octave shift required) so a chord is just "press two keys together".
const notes: NoteEvent[] = [
  n(60, 0.0, Q, 'left'), n(67, 0.0, Q, 'right'), // C4 + G4
  n(69, 0.5, Q), // A4
  n(67, 1.0, Q), // G4
  n(60, 1.5, Q, 'left'), n(64, 1.5, Q, 'right'), // C4 + E4
  n(65, 2.0, Q), // F4
  n(64, 2.5, Q), // E4
  n(62, 3.0, Q, 'left'), n(65, 3.0, Q, 'right'), // D4 + F4
  n(64, 3.5, Q), // E4
  n(60, 4.0, Q, 'left'), n(62, 4.0, Q, 'right'), // C4 + D4
  n(60, 4.5, Q), // C4
  n(64, 5.0, Q), // E4
  n(60, 5.5, Q, 'left'), n(67, 5.5, Q, 'right'), // C4 + G4
  n(65, 6.0, Q), // F4
  n(64, 6.5, Q), // E4
  n(60, 7.0, H, 'left'), n(72, 7.0, H, 'right'), // final chord: C4 + C5, held
]

export const twoHandWaltz: Song = {
  name: 'Two-Hand Waltz',
  notes,
  durationSeconds: 8.0,
}
