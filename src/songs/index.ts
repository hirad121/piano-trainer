import type { Song } from '../midi/types'
import { demoSong } from './demoSong'
import { fastEtude } from './fastEtude'
import { maryHadALittleLamb } from './maryHadALittleLamb'
import { odeToJoy } from './odeToJoy'
import { twoHandWaltz } from './twoHandWaltz'

export type Difficulty = 'beginner' | 'intermediate' | 'advanced'

export interface SongEntry {
  /** Stable key for progress/unlock tracking - never reuse or reorder-invalidate this. */
  id: string
  title: string
  difficulty: Difficulty
  song: Song
}

/**
 * Unlock order: index 0 is always unlocked; index N>0 unlocks once index N-1 has been
 * cleared at >=90% good and >=1x speed (see `progress.ts`'s `isSongUnlocked`).
 */
export const songLibrary: SongEntry[] = [
  { id: 'twinkle-twinkle', title: 'Twinkle Twinkle Little Star', difficulty: 'beginner', song: demoSong },
  { id: 'mary-had-a-little-lamb', title: 'Mary Had a Little Lamb', difficulty: 'beginner', song: maryHadALittleLamb },
  { id: 'ode-to-joy', title: 'Ode to Joy', difficulty: 'beginner', song: odeToJoy },
  { id: 'two-hand-waltz', title: 'Two-Hand Waltz', difficulty: 'intermediate', song: twoHandWaltz },
  { id: 'fast-etude', title: 'Fast Etude', difficulty: 'advanced', song: fastEtude },
]
