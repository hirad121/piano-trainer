import { describe, expect, it } from 'vitest'
import { demoSong } from '../src/songs/demoSong'

describe('demoSong', () => {
  it('is sorted ascending by time, matching the Song contract', () => {
    const times = demoSong.notes.map((n) => n.time)
    const sorted = [...times].sort((a, b) => a - b)
    expect(times).toEqual(sorted)
  })

  it('declares a duration that covers every note', () => {
    const lastNoteEnd = Math.max(...demoSong.notes.map((n) => n.time + n.duration))
    expect(demoSong.durationSeconds).toBeGreaterThanOrEqual(lastNoteEnd)
  })

  it('only uses valid MIDI note numbers and velocities', () => {
    for (const note of demoSong.notes) {
      expect(note.midi).toBeGreaterThanOrEqual(0)
      expect(note.midi).toBeLessThanOrEqual(127)
      expect(note.velocity).toBeGreaterThan(0)
      expect(note.velocity).toBeLessThanOrEqual(1)
    }
  })
})
