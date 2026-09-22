import type { NoteEvent, Song } from '../midi/types'

const Q = 0.5 // quarter note, seconds
const H = 1.0 // half note, seconds

function n(midi: number, time: number, duration: number): NoteEvent {
  return { midi, time, duration, velocity: 0.8, hand: 'right' }
}

// "Mary Had a Little Lamb" - first phrase, right hand only. Public domain melody.
// Even more stepwise/repetitive than the demo song (three-note descending run repeated) -
// a gentle Beginner-tier entry, meant to come before Ode to Joy in the library.
const notes: NoteEvent[] = [
  n(64, 0.0, Q), n(62, 0.5, Q), n(60, 1.0, Q), n(62, 1.5, Q), // E D C D
  n(64, 2.0, Q), n(64, 2.5, Q), n(64, 3.0, H), // E E E(held)
  n(62, 4.0, Q), n(62, 4.5, Q), n(62, 5.0, H), // D D D(held)
  n(64, 6.0, Q), n(67, 6.5, Q), n(67, 7.0, H), // E G G(held)
]

export const maryHadALittleLamb: Song = {
  name: 'Mary Had a Little Lamb',
  notes,
  durationSeconds: 8.0,
}
