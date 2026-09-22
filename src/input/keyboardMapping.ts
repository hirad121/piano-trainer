/**
 * "Musical Typing" style keyboard layout (same idea as GarageBand's):
 * the home row is white keys, the row above is black keys. This keeps
 * every note reachable without moving your fingers off the home row -
 * deliberately chosen so touch-typing muscle memory carries over.
 *
 * Z / X shift the whole mapping down / up an octave, so the full piano
 * range is reachable from the same finger positions.
 */
const SEMITONE_OFFSETS: Record<string, number> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6,
  KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13,
  KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17,
}

/** The character to print on-screen for each `KeyboardEvent.code`. */
const CODE_LABELS: Record<string, string> = {
  KeyA: 'A', KeyW: 'W', KeyS: 'S', KeyE: 'E', KeyD: 'D', KeyF: 'F', KeyT: 'T',
  KeyG: 'G', KeyY: 'Y', KeyH: 'H', KeyU: 'U', KeyJ: 'J', KeyK: 'K', KeyO: 'O',
  KeyL: 'L', KeyP: 'P', Semicolon: ';', Quote: "'",
}

const OFFSET_TO_CODE: Record<number, string> = Object.fromEntries(
  Object.entries(SEMITONE_OFFSETS).map(([code, offset]) => [offset, code]),
)

const ALL_OFFSETS = Object.values(SEMITONE_OFFSETS)
const MIN_OFFSET = Math.min(...ALL_OFFSETS)
const MAX_OFFSET = Math.max(...ALL_OFFSETS)

/** KeyA at octave shift 0 plays middle C (MIDI 60). */
const BASE_MIDI = 60

/** Any of these codes shifts the mapping down/up an octave - Z/X (GarageBand-style) plus the physical Left/Right arrow keys as an alternate, more discoverable shortcut. */
export const OCTAVE_DOWN_KEYS = ['KeyZ', 'ArrowLeft']
export const OCTAVE_UP_KEYS = ['KeyX', 'ArrowRight']
export const MIN_OCTAVE_SHIFT = -3
export const MAX_OCTAVE_SHIFT = 3

export function codeToMidi(code: string, octaveShift: number): number | null {
  const offset = SEMITONE_OFFSETS[code]
  if (offset === undefined) return null
  return BASE_MIDI + offset + octaveShift * 12
}

export function isNoteKey(code: string): boolean {
  return code in SEMITONE_OFFSETS
}

/** The QWERTY key label (e.g. "A", "'") that currently plays this MIDI note, or null if it's out of reach at this octave shift. */
export function midiToKeyLabel(midi: number, octaveShift: number): string | null {
  const offset = midi - BASE_MIDI - octaveShift * 12
  const code = OFFSET_TO_CODE[offset]
  return code ? CODE_LABELS[code] : null
}

/** The MIDI range currently reachable from the QWERTY keyboard at this octave shift. */
export function reachableMidiRange(octaveShift: number): { minMidi: number; maxMidi: number } {
  return {
    minMidi: BASE_MIDI + MIN_OFFSET + octaveShift * 12,
    maxMidi: BASE_MIDI + MAX_OFFSET + octaveShift * 12,
  }
}
