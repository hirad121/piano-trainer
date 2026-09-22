import type { NoteEvent, Song } from '../midi/types'

const Q = 0.5 // quarter note, seconds
const H = 1.0 // half note, seconds

function n(midi: number, time: number, duration: number): NoteEvent {
  return { midi, time, duration, velocity: 0.8, hand: 'right' }
}

// Twinkle Twinkle Little Star - first phrase, right hand only.
// Good first demo song: stepwise, repetitive, easy to verify the mapping by ear.
const notes: NoteEvent[] = [
  n(60, 0.0, Q), n(60, 0.5, Q), // C C
  n(67, 1.0, Q), n(67, 1.5, Q), // G G
  n(69, 2.0, Q), n(69, 2.5, Q), // A A
  n(67, 3.0, H), // G
  n(65, 4.0, Q), n(65, 4.5, Q), // F F
  n(64, 5.0, Q), n(64, 5.5, Q), // E E
  n(62, 6.0, Q), n(62, 6.5, Q), // D D
  n(60, 7.0, H), // C
]

export const demoSong: Song = {
  name: 'Twinkle Twinkle Little Star (demo)',
  notes,
  durationSeconds: 8.0,
}
