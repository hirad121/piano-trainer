import type { PianoEngine } from '../audio/pianoEngine'
import type { NoteEvent, Song } from '../midi/types'
import type { FallingNotesRenderer } from './fallingNotes'

export type Mode = 'listen' | 'practice-wait' | 'play'

/**
 * How a note was judged. `good`/`short`/`long` come from hold-duration grading (press
 * matched, then the hold length was compared to the note's own duration). `miss` (Play
 * mode only - a due note's window closed with no press) and `wrong` (either mode - a
 * pressed key didn't correspond to any currently-due note) are judged at press/timeout
 * time instead, but share the same rendering/scoring pipeline.
 */
export type NoteJudgement = 'short' | 'good' | 'long' | 'miss' | 'wrong'

export interface ReleaseFeedback {
  classification: NoteJudgement
  /** performance.now() ms when this was graded - the renderer fades it out over time from here. */
  timestamp: number
}

/**
 * Running tally of judgements for the current attempt at the current song
 * (Practice-wait and Play mode only - the only modes that judge anything).
 * Deliberately count-based, not points-based: "8/10 good, streak 5" reads
 * clearly at a glance without needing to explain what a "point" is worth.
 * `totalNotes` counts good+short+long+miss - every note eventually gets exactly
 * one of those. `wrong` is a separate, unbounded counter for erroneous presses
 * that don't correspond to any currently-due note - it doesn't count toward
 * `totalNotes`/the good% used for song-clear grading, but it does break a streak.
 */
export interface ScoreState {
  totalNotes: number
  good: number
  short: number
  long: number
  miss: number
  wrong: number
  currentStreak: number
  bestStreak: number
}

const EMPTY_SCORE: ScoreState = {
  totalNotes: 0,
  good: 0,
  short: 0,
  long: 0,
  miss: 0,
  wrong: 0,
  currentStreak: 0,
  bestStreak: 0,
}

const LOOK_AHEAD_SECONDS = 3

// A hold within ±30% of the note's own duration (minimum 80ms, so very short
// notes aren't held to an unreasonably tight window) counts as "good".
const HOLD_TOLERANCE_RATIO = 0.3
const HOLD_TOLERANCE_MIN_SECONDS = 0.08

// Play mode only: how long after a note's own scheduled time it stays gradable before
// counting as a miss. Generous on purpose - reaction-time-to-the-beat isn't what's being
// tested here, only whether the right key gets pressed (and held well) at all.
const MISS_DEADLINE_SECONDS = 0.5

// Pruned from the map after this long - comfortably past the renderer's own
// fade-out (see RELEASE_FEEDBACK_FADE_MS in fallingNotes.ts), just a cleanup
// backstop so the map never accumulates stale entries.
const RELEASE_FEEDBACK_MAX_AGE_MS = 1500

export class PracticeEngine {
  private song: Song | null = null
  private mode: Mode = 'listen'
  private speed = 1
  private playing = false

  /** Clock model: at `startTimestamp` (performance.now ms), song time was `pausedAt`. */
  private startTimestamp = 0
  private pausedAt = 0

  private pendingNotes: NoteEvent[] = [] // not-yet-triggered notes, time-sorted
  private waitGroup: NoteEvent[] = [] // notes practice-wait mode is currently blocked on
  // Required midis that were already held when waitGroup was established - carried
  // over from the previous note/chord rather than freshly struck for this one. Must
  // be released before they can count toward matching (see tickWaitMode).
  private blockedUntilRelease = new Set<number>()
  // Play mode only: notes whose time has arrived but haven't been resolved yet (pressed
  // or timed out), keyed by midi - see tickPlayMode()/notePressed().
  private dueNotes = new Map<number, NoteEvent>()
  // Notes currently sounding because they were just matched (practice-wait or Play mode),
  // keyed by midi - used to grade how long they're actually held for once released (see
  // noteReleased()).
  private activeMatches = new Map<number, { startTimestamp: number; expectedDuration: number }>()
  // Recent grades, for the renderer to show as a brief fading cue on the key.
  private releaseFeedback = new Map<number, ReleaseFeedback>()
  private finished = false
  private score: ScoreState = { ...EMPTY_SCORE }

  constructor(
    private piano: PianoEngine,
    private renderer: FallingNotesRenderer,
    private onStateChange?: (state: { currentTime: number; playing: boolean; finished: boolean; score: ScoreState }) => void,
  ) {}

  loadSong(song: Song): void {
    this.song = song
    this.pausedAt = 0
    this.playing = false
    this.finished = false
    this.score = { ...EMPTY_SCORE }
    this.resetScheduling()
  }

  setMode(mode: Mode): void {
    this.mode = mode
    this.resetScheduling()
  }

  setSpeed(speed: number): void {
    const t = this.currentTime()
    this.speed = speed
    this.pausedAt = t
    this.startTimestamp = performance.now()
  }

  /**
   * No-op in practice-wait mode: that mode is entirely driven by key-matching
   * (see tickWaitMode) and manages its own `playing` transitions internally -
   * an external play() call while genuinely frozen waiting for a key would set
   * `playing = true` without an actual match, which tickWaitMode's real-time
   * catch-up check would then misread as "just matched, catching up to the
   * next note", making the clock (and the falling notes) drift forward with
   * no key ever pressed.
   */
  play(): void {
    if (!this.song || this.playing || this.mode === 'practice-wait') return
    this.playing = true
    this.startTimestamp = performance.now()
  }

  pause(): void {
    if (!this.playing) return
    this.pausedAt = this.currentTime()
    this.playing = false
    this.piano.stopAll()
  }

  togglePlay(): void {
    this.playing ? this.pause() : this.play()
  }

  seek(seconds: number): void {
    this.pausedAt = Math.max(0, seconds)
    this.startTimestamp = performance.now()
    this.piano.stopAll()
    this.resetScheduling()
  }

  /** Rewinds to the start and stops, ready for another play-through. */
  reset(): void {
    this.playing = false
    this.finished = false
    this.score = { ...EMPTY_SCORE }
    this.seek(0)
  }

  isPlaying(): boolean {
    return this.playing
  }

  getScore(): ScoreState {
    return { ...this.score }
  }

  /**
   * Called whenever a physical key is released (any mode). If that pitch was
   * part of a note just matched (practice-wait or Play mode), grades how close
   * the actual hold time was to the note's own duration and records a brief cue
   * for the renderer. A no-op for anything else - an extra/wrong key, a
   * release with no matching note tracked, or in a mode that doesn't match
   * notes at all - so this is always safe to call unconditionally.
   */
  noteReleased(midi: number): void {
    const match = this.activeMatches.get(midi)
    if (!match) return
    this.activeMatches.delete(midi)

    const heldSeconds = (performance.now() - match.startTimestamp) / 1000
    const tolerance = Math.max(HOLD_TOLERANCE_MIN_SECONDS, match.expectedDuration * HOLD_TOLERANCE_RATIO)
    const classification: NoteJudgement =
      heldSeconds < match.expectedDuration - tolerance
        ? 'short'
        : heldSeconds > match.expectedDuration + tolerance
          ? 'long'
          : 'good'

    this.releaseFeedback.set(midi, { classification, timestamp: performance.now() })

    this.score.totalNotes++
    this.score[classification]++
    if (classification === 'good') {
      this.score.currentStreak++
      this.score.bestStreak = Math.max(this.score.bestStreak, this.score.currentStreak)
    } else {
      this.score.currentStreak = 0
    }
  }

  /**
   * Called whenever a physical key is freshly pressed (practice-wait or Play mode only -
   * a no-op otherwise). Detects a **wrong** press: one that doesn't correspond to
   * anything currently due. Correct presses aren't handled here - practice-wait's actual
   * matching still happens per-tick in tickWaitMode(); Play mode's matching moves the due
   * note straight into activeMatches so its later release grades exactly like a
   * practice-wait match via noteReleased() above.
   */
  notePressed(midi: number): void {
    if (this.mode === 'practice-wait') {
      // Skip the momentary empty-waitGroup edge (about to establish, or song over) -
      // there's nothing well-defined to be "wrong" about yet.
      if (this.waitGroup.length > 0 && !this.waitGroup.some((n) => n.midi === midi)) {
        this.recordWrong(midi)
      }
      return
    }

    if (this.mode === 'play') {
      // Not actually playing yet (e.g. loaded but never started, or paused/mid a
      // pre-start countdown in the UI) - nothing is due, so there's nothing to be
      // "wrong" about either. tickPlayMode() only populates dueNotes while playing.
      if (!this.playing) return
      const due = this.dueNotes.get(midi)
      if (due) {
        this.dueNotes.delete(midi)
        this.activeMatches.set(midi, { startTimestamp: performance.now(), expectedDuration: due.duration / this.speed })
      } else {
        this.recordWrong(midi)
      }
    }
  }

  private recordWrong(midi: number): void {
    this.releaseFeedback.set(midi, { classification: 'wrong', timestamp: performance.now() })
    this.score.wrong++
    this.score.currentStreak = 0
  }

  /** Play mode only: a due note's window closed with no press - judged a miss. */
  private judgeMiss(midi: number): void {
    this.dueNotes.delete(midi)
    this.releaseFeedback.set(midi, { classification: 'miss', timestamp: performance.now() })
    this.score.totalNotes++
    this.score.miss++
    this.score.currentStreak = 0
  }

  /** True once the clock has reached the end of the song (see tick()). */
  isFinished(): boolean {
    return this.finished
  }

  currentTime(): number {
    if (!this.playing) return this.pausedAt
    const elapsedSeconds = ((performance.now() - this.startTimestamp) / 1000) * this.speed
    return this.pausedAt + elapsedSeconds
  }

  private resetScheduling(): void {
    this.waitGroup = []
    this.blockedUntilRelease.clear()
    this.dueNotes.clear()
    this.activeMatches.clear()
    this.releaseFeedback.clear()
    if (!this.song) {
      this.pendingNotes = []
      return
    }
    const t = this.currentTime()
    this.pendingNotes = this.song.notes.filter((n) => n.time >= t)
  }

  /** Call once per animation frame. `activeUserMidi` = notes currently held on the QWERTY "keyboard". */
  tick(activeUserMidi: ReadonlySet<number>, octaveShift = 0): void {
    if (!this.song) return

    if (this.mode === 'practice-wait') {
      this.tickWaitMode(activeUserMidi)
    } else if (this.mode === 'play') {
      if (this.playing) this.tickPlayMode()
    } else if (this.playing) {
      this.tickFreeRunning()
    }

    const now = performance.now()
    for (const [midi, feedback] of this.releaseFeedback) {
      if (now - feedback.timestamp > RELEASE_FEEDBACK_MAX_AGE_MS) this.releaseFeedback.delete(midi)
    }

    let t = this.currentTime()
    if (t >= this.song.durationSeconds) {
      // Clamp exactly at the end and stop, in every mode - otherwise the clock
      // (and in practice-wait mode, `playing`) would run forever past the last
      // note once nothing is left to catch up to or wait for.
      t = this.song.durationSeconds
      this.pausedAt = t
      if (this.playing) {
        this.playing = false
        this.piano.stopAll()
      }
      this.finished = true
    } else {
      this.finished = false
    }

    this.onStateChange?.({ currentTime: t, playing: this.playing, finished: this.finished, score: this.getScore() })
    this.renderer.render(this.song, t, LOOK_AHEAD_SECONDS, activeUserMidi, octaveShift, this.releaseFeedback)
  }

  /** listen: clock runs freely and auto-sounds each note - no grading, nothing is due/missable. */
  private tickFreeRunning(): void {
    const t = this.currentTime()
    while (this.pendingNotes.length && this.pendingNotes[0].time <= t) {
      const note = this.pendingNotes.shift()!
      this.piano.noteOnFor(note.midi, note.duration / this.speed, note.velocity)
    }
  }

  /**
   * play: clock runs freely, same pacing as listen, but nothing is auto-sounded and every
   * note must actually be judged. A note becomes "due" once its time arrives; it stays
   * gradable (see notePressed()) until MISS_DEADLINE_SECONDS after its own time, at which
   * point it's judged a miss if still unresolved.
   */
  private tickPlayMode(): void {
    const t = this.currentTime()
    while (this.pendingNotes.length && this.pendingNotes[0].time <= t) {
      const note = this.pendingNotes.shift()!
      // A same-pitch note becoming due again before the previous instance was resolved
      // (rare - faster repeats than MISS_DEADLINE_SECONDS) - judge the earlier one a miss
      // first rather than silently overwriting it.
      if (this.dueNotes.has(note.midi)) this.judgeMiss(note.midi)
      this.dueNotes.set(note.midi, note)
    }

    for (const [midi, note] of this.dueNotes) {
      if (t > note.time + MISS_DEADLINE_SECONDS) this.judgeMiss(midi)
    }
  }

  /**
   * practice-wait: freezes the clock at each chord/note until the right key(s) are
   * held, then - instead of snapping straight to the next note - lets the clock run
   * forward in real time (same as listen/free-play) until it actually reaches the
   * next note's timestamp. That's what makes the falling notes visibly move between
   * matches, and gives the player a sense of the song's rhythm instead of an instant
   * cut to the next chord.
   */
  private tickWaitMode(activeUserMidi: ReadonlySet<number>): void {
    // Release detection: a required key that was carried over from the previous
    // match (still held, never let go) stops blocking as soon as it's released -
    // whether or not it's part of the current wait group.
    for (const m of this.blockedUntilRelease) {
      if (!activeUserMidi.has(m)) this.blockedUntilRelease.delete(m)
    }

    if (this.waitGroup.length === 0) {
      if (!this.pendingNotes.length) return
      const nextTime = this.pendingNotes[0].time

      if (this.playing && this.currentTime() < nextTime) {
        return // still catching up toward nextTime in real time - not there yet
      }

      this.waitGroup = this.pendingNotes.filter((n) => n.time === nextTime)
      this.pausedAt = nextTime // snap exactly, so frame-timing jitter can't overshoot
      this.startTimestamp = performance.now()
      this.playing = false // hold here until matched

      // Any required key already held right now was carried over from whatever
      // came before this wait group (silence, or the previous note/chord) rather
      // than freshly struck for THIS one - block it until it's released, so
      // repeated same-pitch notes require a real re-attack instead of being
      // satisfied by holding straight through.
      const requiredMidis = this.waitGroup.map((n) => n.midi)
      this.blockedUntilRelease = new Set(requiredMidis.filter((m) => activeUserMidi.has(m)))
    }

    const required = this.waitGroup.map((n) => n.midi)
    const allHeld = required.every((m) => activeUserMidi.has(m) && !this.blockedUntilRelease.has(m))
    if (!allHeld) return

    const now = performance.now()
    for (const note of this.waitGroup) {
      // expectedDuration is compared against wall-clock held time in noteReleased(),
      // so it must be converted from song-time to real-time here - at anything but
      // 1x speed, note.duration itself is the wrong unit (e.g. at 0.5x speed, a note
      // written as 0.5s actually needs to be held 1s of real time to be "correct").
      this.activeMatches.set(note.midi, { startTimestamp: now, expectedDuration: note.duration / this.speed })
    }
    const matchedTime = this.waitGroup[0].time
    this.pendingNotes = this.pendingNotes.filter((n) => n.time !== matchedTime)
    this.waitGroup = []
    this.playing = true
    this.startTimestamp = now
  }
}
