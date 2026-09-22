import type { SongEntry } from './songs'

const STORAGE_KEY = 'piano-trainer:progress:v1'

/** A song unlocks once the previous one is cleared at this "good" percentage or higher. */
export const UNLOCK_THRESHOLD_PCT = 90

export interface ProgressStore {
  [songId: string]: { bestPct: number }
}

/**
 * Reads saved progress. Storage is a parameter (defaulting to the real
 * `window.localStorage`) rather than read directly, so this is unit-testable with a fake
 * `Storage` the same way `practiceEngine` tests fake `PianoEngine`/`FallingNotesRenderer`.
 * Falls back to an empty store on any failure - missing key, corrupt JSON, storage
 * unavailable (private browsing, disabled) - rather than throwing, since progress is a
 * nice-to-have, not something that should ever break the app from loading.
 */
export function loadProgress(storage: Storage = window.localStorage): ProgressStore {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as ProgressStore
  } catch {
    return {}
  }
}

/**
 * Records one attempt's result for a song, keeping only the best `pct` ever seen (a
 * worse run never lowers a previously-recorded best). Returns the updated store; also
 * persists it (best-effort - a storage failure here is swallowed, not thrown).
 */
export function recordAttempt(
  store: ProgressStore,
  songId: string,
  pct: number,
  storage: Storage = window.localStorage,
): ProgressStore {
  const previousBest = store[songId]?.bestPct ?? 0
  const updated: ProgressStore = { ...store, [songId]: { bestPct: Math.max(previousBest, pct) } }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch {
    // Best-effort persistence - the caller still gets the updated in-memory store back.
  }
  return updated
}

/** Index 0 is always unlocked; index N>0 unlocks once entry N-1 was cleared at >=90%. */
export function isSongUnlocked(index: number, entries: readonly SongEntry[], store: ProgressStore): boolean {
  if (index <= 0) return true
  const previous = entries[index - 1]
  if (!previous) return false
  return (store[previous.id]?.bestPct ?? 0) >= UNLOCK_THRESHOLD_PCT
}
