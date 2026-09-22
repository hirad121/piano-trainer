import type { NoteEvent, Song } from '../midi/types'

const Q = 0.5 // quarter note, seconds
const H = 1.0 // half note, seconds

function n(midi: number, time: number, duration: number): NoteEvent {
  return { midi, time, duration, velocity: 0.8, hand: 'right' }
}

// "Ode to Joy" (Beethoven) - first phrase, right hand only. Public domain melody.
// Stepwise like the demo song, but crosses more scale degrees (E through C) - a small
// step up from Twinkle Twinkle within the same Beginner tier.
const notes: NoteEvent[] = [
  n(64, 0.0, Q), n(64, 0.5, Q), n(65, 1.0, Q), n(67, 1.5, Q), // E E F G
  n(67, 2.0, Q), n(65, 2.5, Q), n(64, 3.0, Q), n(62, 3.5, Q), // G F E D
  n(60, 4.0, Q), n(60, 4.5, Q), n(62, 5.0, Q), n(64, 5.5, Q), // C C D E
  n(64, 6.0, Q), n(62, 6.5, Q), n(62, 7.0, H), // E D D(held)
]

export const odeToJoy: Song = {
  name: 'Ode to Joy (Beethoven)',
  notes,
  durationSeconds: 8.0,
}
