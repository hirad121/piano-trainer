import {
  MAX_OCTAVE_SHIFT,
  MIN_OCTAVE_SHIFT,
  OCTAVE_DOWN_KEYS,
  OCTAVE_UP_KEYS,
  codeToMidi,
  isNoteKey,
} from './keyboardMapping'

export interface KeyboardInputHandlers {
  onNoteOn: (midi: number) => void
  onNoteOff: (midi: number) => void
  onOctaveChange?: (shift: number) => void
}

export class KeyboardInput {
  private octaveShift = 0
  /** Tracks which physical key is sounding which note, so key-repeat never retriggers and key-up releases the right note even after an octave shift mid-press. */
  private activeKeys = new Map<string, number>()

  constructor(private handlers: KeyboardInputHandlers) {
    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('keyup', this.handleKeyUp)
  }

  destroy(): void {
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('keyup', this.handleKeyUp)
  }

  getOctaveShift(): number {
    return this.octaveShift
  }

  /** Same effect as pressing Z - exposed for on-screen octave-shift controls. */
  shiftOctaveDown(): void {
    this.octaveShift = Math.max(MIN_OCTAVE_SHIFT, this.octaveShift - 1)
    this.handlers.onOctaveChange?.(this.octaveShift)
  }

  /** Same effect as pressing X - exposed for on-screen octave-shift controls. */
  shiftOctaveUp(): void {
    this.octaveShift = Math.min(MAX_OCTAVE_SHIFT, this.octaveShift + 1)
    this.handlers.onOctaveChange?.(this.octaveShift)
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return

    if (OCTAVE_DOWN_KEYS.includes(e.code)) {
      this.shiftOctaveDown()
      return
    }
    if (OCTAVE_UP_KEYS.includes(e.code)) {
      this.shiftOctaveUp()
      return
    }

    if (!isNoteKey(e.code) || this.activeKeys.has(e.code)) return
    const midi = codeToMidi(e.code, this.octaveShift)
    if (midi === null) return

    this.activeKeys.set(e.code, midi)
    this.handlers.onNoteOn(midi)
  }

  private handleKeyUp = (e: KeyboardEvent): void => {
    const midi = this.activeKeys.get(e.code)
    if (midi === undefined) return
    this.activeKeys.delete(e.code)
    this.handlers.onNoteOff(midi)
  }
}
