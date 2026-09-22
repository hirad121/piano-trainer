import { midiToKeyLabel, reachableMidiRange } from '../input/keyboardMapping'
import type { Song } from '../midi/types'
import type { NoteJudgement, ReleaseFeedback } from './practiceEngine'

const BLACK_KEY_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]) // C#, D#, F#, G#, A#
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** Height of the piano keys themselves (unchanged from before the note-name row was added). */
const KEY_AREA_HEIGHT_PX = 190
/** Blank breathing room between the bottom of the keys and the note-name row below them. */
const KEY_LABEL_GAP_PX = 10
/** Height reserved for the "C4"-style note-name row under each key. */
const NOTE_NAME_ROW_HEIGHT_PX = 20
/** Blank margin below the note-name row, so the whole block doesn't sit flush against the bottom edge. */
const BOTTOM_MARGIN_PX = 10

/**
 * Total height of the keyboard block (keys + gap + note-name row + bottom
 * margin) - exported so index.html/style.css can size the on-screen
 * octave-shift buttons to span the same area.
 */
export const KEYBOARD_HEIGHT_PX = KEY_AREA_HEIGHT_PX + KEY_LABEL_GAP_PX + NOTE_NAME_ROW_HEIGHT_PX + BOTTOM_MARGIN_PX

/** "C4", "C#4", etc. - MIDI 60 is C4 by the standard scientific-pitch convention. */
function midiToNoteName(midi: number): string {
  const name = NOTE_NAMES[((midi % 12) + 12) % 12]
  const octave = Math.floor(midi / 12) - 1
  return `${name}${octave}`
}

/** Extra unlabeled keys shown on each side of the currently-reachable window, so the keyboard reads as a real piano rather than a tightly cropped strip. */
const DISPLAY_PADDING_SEMITONES = 12

/** How long the keyboard/labels take to slide + crossfade to a new octave. */
const OCTAVE_TRANSITION_MS = 250

/**
 * Visual-only gap trimmed off the trailing (top) edge of every note bar, so
 * back-to-back notes at the same pitch - e.g. the demo song's repeated "C C"
 * - render as two clearly separate bars instead of one unbroken column.
 * Without this, adjacent notes share an exact pixel boundary and are
 * indistinguishable from a single held note. Purely cosmetic: it never
 * touches the actual note.time/duration used for playback or wait-mode
 * matching, and it's trimmed from the trailing edge only, so the leading
 * edge - which lines up with the hit line at the moment the note should be
 * struck - stays exactly accurate.
 */
const NOTE_GAP_PX = 5

/** How long a hold-accuracy cue (see ReleaseFeedback) stays visible on a key before fully fading out. */
const RELEASE_FEEDBACK_FADE_MS = 750
/** Initial slice of RELEASE_FEEDBACK_FADE_MS held at full strength before the fade-out begins - makes the flash register as a clear "hit" rather than a corner-of-the-eye smudge. */
const RELEASE_FEEDBACK_HOLD_MS = 150
const RELEASE_FEEDBACK_PEAK_ALPHA = 0.9

const HOLD_FEEDBACK_COLORS: Record<NoteJudgement, string> = {
  good: '#3ddc84',
  short: '#f5c542',
  long: '#ff5c5c',
  miss: '#ff5c5c',
  wrong: '#ff5c5c',
}

function displayRange(octaveShift: number): { minMidi: number; maxMidi: number } {
  const { minMidi, maxMidi } = reachableMidiRange(octaveShift)
  return { minMidi: minMidi - DISPLAY_PADDING_SEMITONES, maxMidi: maxMidi + DISPLAY_PADDING_SEMITONES }
}

export class FallingNotesRenderer {
  private ctx: CanvasRenderingContext2D
  // Continuous (non-integer) during an octave-shift transition, so keys can
  // slide smoothly instead of snapping - see render()'s transition handling.
  private minMidi: number
  private maxMidi: number
  private keyboardHeight = KEYBOARD_HEIGHT_PX

  private currentOctaveShift = 0
  private previousOctaveShift = 0
  // Far enough in the past that the first render() is never "mid-transition".
  private transitionStart = -OCTAVE_TRANSITION_MS

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')
    this.ctx = ctx
    const initial = displayRange(0)
    this.minMidi = initial.minMidi
    this.maxMidi = initial.maxMidi
  }

  resize(width: number, height: number): void {
    const dpr = window.devicePixelRatio || 1
    this.canvas.width = width * dpr
    this.canvas.height = height * dpr
    this.canvas.style.width = `${width}px`
    this.canvas.style.height = `${height}px`
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  render(
    song: Song | null,
    currentTime: number,
    lookAheadSeconds: number,
    activeMidi: ReadonlySet<number>,
    octaveShift = 0,
    releaseFeedback: ReadonlyMap<number, ReleaseFeedback> = new Map(),
  ): void {
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    const ctx = this.ctx

    if (octaveShift !== this.currentOctaveShift) {
      this.previousOctaveShift = this.currentOctaveShift
      this.currentOctaveShift = octaveShift
      this.transitionStart = performance.now()
    }
    const transitionProgress = Math.min(1, (performance.now() - this.transitionStart) / OCTAVE_TRANSITION_MS)

    const from = displayRange(this.previousOctaveShift)
    const to = displayRange(this.currentOctaveShift)
    this.minMidi = from.minMidi + (to.minMidi - from.minMidi) * transitionProgress
    this.maxMidi = from.maxMidi + (to.maxMidi - from.maxMidi) * transitionProgress

    ctx.clearRect(0, 0, width, height)

    const hitLineY = height - this.keyboardHeight
    const pxPerSecond = hitLineY / lookAheadSeconds

    if (song) {
      // A currently-sounding (or just-finished) note's bar legitimately
      // overhangs past the hit line - that's what makes it look like it
      // slides "into" the keys. It must never overhang further than the
      // opaque key rectangles reach, though: past KEY_AREA_HEIGHT_PX is the
      // blank gap/note-name strip added below the keys, which isn't opaque,
      // so an unclamped bar would bleed through there instead of being
      // covered.
      const maxYBottom = hitLineY + KEY_AREA_HEIGHT_PX

      for (const note of song.notes) {
        const noteEnd = note.time + note.duration
        if (noteEnd < currentTime - 0.3) continue
        if (note.time > currentTime + lookAheadSeconds) break // notes are time-sorted

        const x = this.midiToX(note.midi, width)
        const noteWidth = this.keyWidth(note.midi, width) - 2
        const yBottom = Math.min(maxYBottom, hitLineY - (note.time - currentTime) * pxPerSecond)
        const yTop = hitLineY - (noteEnd - currentTime) * pxPerSecond + NOTE_GAP_PX
        const barHeight = Math.max(4, yBottom - yTop)

        ctx.fillStyle = note.hand === 'left' ? '#5b9dff' : '#ff8a5b'
        ctx.globalAlpha = activeMidi.has(note.midi) ? 1 : 0.85
        ctx.fillRect(x, yTop, noteWidth, barHeight)
      }
      ctx.globalAlpha = 1
    }

    // hit line
    ctx.strokeStyle = '#e8e8ec'
    ctx.globalAlpha = 0.4
    ctx.beginPath()
    ctx.moveTo(0, hitLineY)
    ctx.lineTo(width, hitLineY)
    ctx.stroke()
    ctx.globalAlpha = 1

    this.drawKeyboard(width, height, hitLineY, activeMidi, transitionProgress, releaseFeedback)
  }

  private drawKeyboard(
    width: number,
    _height: number,
    top: number,
    activeMidi: ReadonlySet<number>,
    transitionProgress: number,
    releaseFeedback: ReadonlyMap<number, ReleaseFeedback>,
  ): void {
    const ctx = this.ctx
    const startMidi = Math.floor(this.minMidi)
    const endMidi = Math.ceil(this.maxMidi)
    const noteNameBaselineY = top + KEY_AREA_HEIGHT_PX + KEY_LABEL_GAP_PX + NOTE_NAME_ROW_HEIGHT_PX

    // white keys first (full height), then black keys on top (partial height)
    for (let midi = startMidi; midi <= endMidi; midi++) {
      if (BLACK_KEY_PITCH_CLASSES.has(midi % 12)) continue
      const x = this.midiToX(midi, width)
      const w = this.keyWidth(midi, width) - 1
      const active = activeMidi.has(midi)
      ctx.fillStyle = active ? '#5b9dff' : '#e8e8ec'
      ctx.fillRect(x, top, w, KEY_AREA_HEIGHT_PX)
      ctx.strokeStyle = '#0d0f13'
      ctx.strokeRect(x, top, w, KEY_AREA_HEIGHT_PX)

      this.drawReleaseFeedback(midi, x, w, top, KEY_AREA_HEIGHT_PX, releaseFeedback)
      this.drawKeyLabel(midi, x, w, top + KEY_AREA_HEIGHT_PX - 14, active ? '#e8e8ec' : '#5a5f6b', 25, transitionProgress)
      this.drawNoteNameLabel(midi, x, w, noteNameBaselineY)
    }
    for (let midi = startMidi; midi <= endMidi; midi++) {
      if (!BLACK_KEY_PITCH_CLASSES.has(midi % 12)) continue
      const x = this.midiToX(midi, width)
      const w = this.keyWidth(midi, width) - 1
      const active = activeMidi.has(midi)
      const blackKeyHeight = KEY_AREA_HEIGHT_PX * 0.6
      ctx.fillStyle = active ? '#ff8a5b' : '#2a2e36'
      ctx.fillRect(x, top, w, blackKeyHeight)

      this.drawReleaseFeedback(midi, x, w, top, blackKeyHeight, releaseFeedback)
      this.drawKeyLabel(midi, x, w, top + blackKeyHeight - 10, '#e8e8ec', 20, transitionProgress)
      this.drawNoteNameLabel(midi, x, w, noteNameBaselineY)
    }
  }

  /**
   * The actual note name ("C4", "F#3", ...) in the blank strip below each
   * key - unlike the QWERTY letter label, this applies to every key in the
   * displayed range (not just the currently-reachable ones) and needs no
   * octave-shift crossfade: it's keyed to the MIDI number itself, which
   * already slides continuously via midiToX() as minMidi/maxMidi animate,
   * so the label just moves with its key.
   */
  private drawNoteNameLabel(midi: number, x: number, w: number, baselineY: number): void {
    const ctx = this.ctx
    ctx.fillStyle = '#7a8090'
    ctx.font = `500 ${Math.min(15, w * 0.4)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText(midiToNoteName(midi), x + w / 2, baselineY)
  }

  /**
   * Briefly washes a key green/amber/red for whatever PracticeEngine most recently judged
   * it: held close to the note's own length (good), cut short or held too long (short/
   * long), a due note that timed out unplayed (miss, Play mode), or a press that didn't
   * correspond to anything currently due (wrong) - fades out on its own over
   * RELEASE_FEEDBACK_FADE_MS, purely as a function of elapsed time, so no per-frame state
   * is needed here beyond the timestamp PracticeEngine already recorded. Works the same
   * regardless of whether the entry was set at release, at press, or from a tick-driven
   * timeout - this function doesn't need to know which.
   */
  private drawReleaseFeedback(
    midi: number,
    x: number,
    w: number,
    top: number,
    keyHeight: number,
    releaseFeedback: ReadonlyMap<number, ReleaseFeedback>,
  ): void {
    const feedback = releaseFeedback.get(midi)
    if (!feedback) return

    const age = performance.now() - feedback.timestamp
    if (age >= RELEASE_FEEDBACK_FADE_MS) return

    const alpha =
      age < RELEASE_FEEDBACK_HOLD_MS
        ? RELEASE_FEEDBACK_PEAK_ALPHA
        : RELEASE_FEEDBACK_PEAK_ALPHA *
          (1 - (age - RELEASE_FEEDBACK_HOLD_MS) / (RELEASE_FEEDBACK_FADE_MS - RELEASE_FEEDBACK_HOLD_MS))

    const ctx = this.ctx
    ctx.fillStyle = HOLD_FEEDBACK_COLORS[feedback.classification]
    ctx.globalAlpha = alpha
    ctx.fillRect(x, top, w, keyHeight)
    ctx.globalAlpha = 1
  }

  /** Crossfades between the previous and current octave's label for this key, if either has one. */
  private drawKeyLabel(
    midi: number,
    x: number,
    w: number,
    baselineY: number,
    color: string,
    maxFontPx: number,
    transitionProgress: number,
  ): void {
    const ctx = this.ctx
    const oldLabel = transitionProgress < 1 ? midiToKeyLabel(midi, this.previousOctaveShift) : null
    const newLabel = midiToKeyLabel(midi, this.currentOctaveShift)
    if (!oldLabel && !newLabel) return

    ctx.fillStyle = color
    ctx.font = `600 ${Math.min(maxFontPx, w * 0.4)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'

    if (oldLabel) {
      ctx.globalAlpha = 1 - transitionProgress
      ctx.fillText(oldLabel, x + w / 2, baselineY)
    }
    if (newLabel) {
      ctx.globalAlpha = oldLabel ? transitionProgress : 1
      ctx.fillText(newLabel, x + w / 2, baselineY)
    }
    ctx.globalAlpha = 1
  }

  private midiToX(midi: number, width: number): number {
    const clamped = Math.min(this.maxMidi, Math.max(this.minMidi, midi))
    const span = this.maxMidi - this.minMidi + 1
    const ratio = (clamped - this.minMidi) / span
    return ratio * width
  }

  private keyWidth(_midi: number, width: number): number {
    const span = this.maxMidi - this.minMidi + 1
    return width / span
  }
}
