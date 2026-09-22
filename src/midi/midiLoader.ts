import { Midi } from '@tonejs/midi'
import type { Hand, NoteEvent, Song } from './types'

/**
 * Reads a .mid/.midi File and converts it into our internal Song format.
 *
 * Hand assignment heuristic:
 * - 2+ note-tracks: the track with the lower average pitch is "left hand",
 *   the rest are "right hand" (matches the common piano-MIDI convention of
 *   one track per staff).
 * - a single track: split note-by-note at middle C (MIDI 60).
 * This is a heuristic, not ground truth - some files will split oddly.
 */
export async function loadMidiFile(file: File): Promise<Song> {
  const arrayBuffer = await file.arrayBuffer()
  const midi = new Midi(arrayBuffer)
  const name = file.name.replace(/\.[^/.]+$/, '')
  return midiToSong(midi, name)
}

function midiToSong(midi: Midi, name: string): Song {
  const tracks = midi.tracks.filter((t) => t.notes.length > 0)
  const avgPitch = (notes: { midi: number }[]) =>
    notes.reduce((sum, n) => sum + n.midi, 0) / notes.length

  let leftTrackIndex = -1
  if (tracks.length >= 2) {
    const sortedByPitch = [...tracks].sort(
      (a, b) => avgPitch(a.notes) - avgPitch(b.notes),
    )
    leftTrackIndex = tracks.indexOf(sortedByPitch[0])
  }

  const notes: NoteEvent[] = []
  tracks.forEach((track, i) => {
    const trackHand: Hand | undefined =
      tracks.length >= 2 ? (i === leftTrackIndex ? 'left' : 'right') : undefined

    for (const n of track.notes) {
      const hand: Hand = trackHand ?? (n.midi < 60 ? 'left' : 'right')
      notes.push({
        midi: n.midi,
        time: n.time,
        duration: Math.max(n.duration, 0.05),
        velocity: n.velocity,
        hand,
      })
    }
  })

  notes.sort((a, b) => a.time - b.time)
  const durationSeconds = notes.reduce(
    (max, n) => Math.max(max, n.time + n.duration),
    0,
  )

  return { name, notes, durationSeconds }
}
