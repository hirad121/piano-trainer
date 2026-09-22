export type Hand = 'left' | 'right'

export interface NoteEvent {
  midi: number
  time: number // seconds from song start
  duration: number // seconds
  velocity: number // 0-1
  hand: Hand
}

export interface Song {
  name: string
  notes: NoteEvent[] // sorted ascending by time
  durationSeconds: number
}
