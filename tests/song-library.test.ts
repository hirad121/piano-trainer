import { describe, expect, it } from 'vitest'
import { songLibrary } from '../src/songs'

describe('songLibrary manifest', () => {
  it('is non-empty', () => {
    expect(songLibrary.length).toBeGreaterThan(0)
  })

  it('has unique, non-empty ids', () => {
    const ids = songLibrary.map((e) => e.id)
    expect(ids.every((id) => id.length > 0)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('only uses the three known difficulty levels', () => {
    for (const entry of songLibrary) {
      expect(['beginner', 'intermediate', 'advanced']).toContain(entry.difficulty)
    }
  })

  it('starts with a beginner song, so index 0 (always unlocked) is actually easy', () => {
    expect(songLibrary[0].difficulty).toBe('beginner')
  })
})

describe.each(songLibrary)('song "$title" ($id)', (entry) => {
  const { song } = entry

  it('has at least one note', () => {
    expect(song.notes.length).toBeGreaterThan(0)
  })

  it('is sorted ascending by time, matching the Song contract', () => {
    const times = song.notes.map((n) => n.time)
    const sorted = [...times].sort((a, b) => a - b)
    expect(times).toEqual(sorted)
  })

  it('declares a duration that covers every note', () => {
    const lastNoteEnd = Math.max(...song.notes.map((n) => n.time + n.duration))
    expect(song.durationSeconds).toBeGreaterThanOrEqual(lastNoteEnd)
  })

  it('only uses valid MIDI note numbers, positive durations, and valid velocities', () => {
    for (const note of song.notes) {
      expect(note.midi).toBeGreaterThanOrEqual(0)
      expect(note.midi).toBeLessThanOrEqual(127)
      expect(note.duration).toBeGreaterThan(0)
      expect(note.velocity).toBeGreaterThan(0)
      expect(note.velocity).toBeLessThanOrEqual(1)
    }
  })

  it('never has two notes at the exact same time and pitch (an unplayable "chord")', () => {
    // PracticeEngine's wait-group logic treats all notes sharing a `time` as one chord
    // to hold simultaneously - a duplicate (time, midi) pair would be indistinguishable
    // from a single note and can never actually be matched twice.
    const seen = new Set<string>()
    for (const note of song.notes) {
      const key = `${note.time}:${note.midi}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
  })
})
