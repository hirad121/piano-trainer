import type { NoteEvent, Song } from '../midi/types'

const INTERVAL = 0.5 // seconds between hits
const HOLD = 0.35 // leaves a real gap before the re-press, so repeats require re-attacking
const REPEATS = 16

// Inspired by the famous solo-piano intro to Kanye West's "Runaway" - a single note,
// struck repeatedly and deliberately, before the beat comes in. This is NOT a verified
// transcription of the original (exact pitch/rhythm not confirmed) - it's a practice
// piece capturing that "one note, real timing" feel, and a good drill for the
// re-attack-a-repeated-note mechanic every mode already enforces.
const notes: NoteEvent[] = Array.from({ length: REPEATS }, (_, i) => ({
  midi: 65, // F4
  time: i * INTERVAL,
  duration: HOLD,
  velocity: 0.75,
  hand: 'right',
}))

export const runawayIntro: Song = {
  name: 'Runaway',
  notes,
  durationSeconds: REPEATS * INTERVAL,
}
