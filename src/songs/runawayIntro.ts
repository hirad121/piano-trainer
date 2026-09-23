import type { NoteEvent, Song } from '../midi/types'

function n(midi: number, time: number, duration: number): NoteEvent {
  return { midi, time, duration, velocity: 0.75, hand: 'right' }
}

// The solo-piano intro to Kanye West's "Runaway" (808s & Heartbreak), up to where the
// beat comes in - transcribed from a real MIDI source, not approximated. A descending
// three-note-plus-echo pattern (E, E, E, echo an octave down; same for D#, C#), then
// A, A, G#, and a short E pickup into the beat.
const notes: NoteEvent[] = [
  n(88, 0.75, 1.406), // E6
  n(88, 2.25, 1.406), // E6
  n(88, 3.75, 1.406), // E6
  n(76, 5.25, 1.406), // E5 (octave echo)
  n(87, 6.75, 1.406), // D#6
  n(87, 8.25, 1.406), // D#6
  n(87, 9.75, 1.406), // D#6
  n(75, 11.25, 1.406), // D#5 (octave echo)
  n(85, 12.75, 1.406), // C#6
  n(85, 14.25, 1.406), // C#6
  n(85, 15.75, 1.406), // C#6
  n(73, 17.25, 1.406), // C#5 (octave echo)
  n(81, 18.75, 1.406), // A5
  n(81, 20.25, 1.406), // A5
  n(80, 21.75, 2.156), // G#5
  n(88, 23.25, 0.75), // E6 (pickup into the beat)
]

export const runawayIntro: Song = {
  name: 'Runaway',
  notes,
  durationSeconds: 24.0,
}
