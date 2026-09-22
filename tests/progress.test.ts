import { describe, expect, it } from 'vitest'
import { isSongUnlocked, loadProgress, recordAttempt, UNLOCK_THRESHOLD_PCT } from '../src/progress'
import type { SongEntry } from '../src/songs'

/** Minimal in-memory Storage fake - avoids depending on a real browser/jsdom localStorage. */
function makeFakeStorage(initial: Record<string, string> = {}): Storage {
  const data: Record<string, string> = { ...initial }
  return {
    getItem: (key: string) => (key in data ? data[key] : null),
    setItem: (key: string, value: string) => {
      data[key] = value
    },
    removeItem: (key: string) => {
      delete data[key]
    },
    clear: () => {
      for (const key of Object.keys(data)) delete data[key]
    },
    key: (i: number) => Object.keys(data)[i] ?? null,
    get length() {
      return Object.keys(data).length
    },
  } as Storage
}

/** Simulates storage being unavailable (e.g. private browsing with storage disabled). */
function makeThrowingStorage(): Storage {
  return {
    getItem: () => {
      throw new Error('storage unavailable')
    },
    setItem: () => {
      throw new Error('storage unavailable')
    },
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  } as Storage
}

function makeEntry(id: string): SongEntry {
  return { id, title: id, difficulty: 'beginner', song: { name: id, notes: [], durationSeconds: 0 } }
}

describe('loadProgress', () => {
  it('returns an empty store when nothing is saved', () => {
    expect(loadProgress(makeFakeStorage())).toEqual({})
  })

  it('parses a previously saved store', () => {
    const storage = makeFakeStorage({ 'piano-trainer:progress:v1': JSON.stringify({ a: { bestPct: 75 } }) })
    expect(loadProgress(storage)).toEqual({ a: { bestPct: 75 } })
  })

  it('falls back to an empty store on corrupt JSON rather than throwing', () => {
    const storage = makeFakeStorage({ 'piano-trainer:progress:v1': '{not valid json' })
    expect(() => loadProgress(storage)).not.toThrow()
    expect(loadProgress(storage)).toEqual({})
  })

  it('falls back to an empty store when storage itself throws', () => {
    expect(() => loadProgress(makeThrowingStorage())).not.toThrow()
    expect(loadProgress(makeThrowingStorage())).toEqual({})
  })
})

describe('recordAttempt', () => {
  it('records a first attempt', () => {
    const result = recordAttempt({}, 'song-a', 82, makeFakeStorage())
    expect(result).toEqual({ 'song-a': { bestPct: 82 } })
  })

  it('raises the best score on a better attempt', () => {
    const first = recordAttempt({}, 'song-a', 70, makeFakeStorage())
    const second = recordAttempt(first, 'song-a', 95, makeFakeStorage())
    expect(second['song-a'].bestPct).toBe(95)
  })

  it('does not lower the best score on a worse attempt', () => {
    const first = recordAttempt({}, 'song-a', 95, makeFakeStorage())
    const second = recordAttempt(first, 'song-a', 40, makeFakeStorage())
    expect(second['song-a'].bestPct).toBe(95)
  })

  it('persists to storage so a later loadProgress sees it', () => {
    const storage = makeFakeStorage()
    recordAttempt({}, 'song-a', 91, storage)
    expect(loadProgress(storage)).toEqual({ 'song-a': { bestPct: 91 } })
  })

  it('does not affect other songs in the store', () => {
    const store = recordAttempt({}, 'song-a', 91, makeFakeStorage())
    const updated = recordAttempt(store, 'song-b', 60, makeFakeStorage())
    expect(updated).toEqual({ 'song-a': { bestPct: 91 }, 'song-b': { bestPct: 60 } })
  })

  it('still returns the updated in-memory store when persisting fails', () => {
    const result = recordAttempt({}, 'song-a', 91, makeThrowingStorage())
    expect(result).toEqual({ 'song-a': { bestPct: 91 } })
  })
})

describe('isSongUnlocked', () => {
  const entries = [makeEntry('a'), makeEntry('b'), makeEntry('c')]

  it('index 0 is always unlocked, regardless of progress', () => {
    expect(isSongUnlocked(0, entries, {})).toBe(true)
  })

  it('is locked when the previous song has no recorded attempts', () => {
    expect(isSongUnlocked(1, entries, {})).toBe(false)
  })

  it('is locked when the previous song is below the threshold', () => {
    const store = { a: { bestPct: UNLOCK_THRESHOLD_PCT - 1 } }
    expect(isSongUnlocked(1, entries, store)).toBe(false)
  })

  it('unlocks exactly at the threshold', () => {
    const store = { a: { bestPct: UNLOCK_THRESHOLD_PCT } }
    expect(isSongUnlocked(1, entries, store)).toBe(true)
  })

  it('unlocks above the threshold', () => {
    const store = { a: { bestPct: 100 } }
    expect(isSongUnlocked(1, entries, store)).toBe(true)
  })

  it('checks the immediately preceding entry, not just entry 0', () => {
    // song 'a' cleared, but 'b' (the one right before 'c') was not.
    const store = { a: { bestPct: 100 } }
    expect(isSongUnlocked(2, entries, store)).toBe(false)
  })

  it('returns false for an index with no preceding entry in a shorter list', () => {
    expect(isSongUnlocked(5, entries, { c: { bestPct: 100 } })).toBe(false)
  })
})
