import { describe, expect, it } from 'vitest'
import {
  OCTAVE_DOWN_KEYS,
  OCTAVE_UP_KEYS,
  codeToMidi,
  isNoteKey,
  midiToKeyLabel,
  reachableMidiRange,
} from '../src/input/keyboardMapping'

describe('codeToMidi', () => {
  it('maps KeyA to middle C at zero octave shift', () => {
    expect(codeToMidi('KeyA', 0)).toBe(60)
  })

  it('maps a black-key code to the semitone above its neighboring white key', () => {
    expect(codeToMidi('KeyW', 0)).toBe(61) // W sits above A (60) => C#4
  })

  it('shifts by a full octave (12 semitones) per octaveShift step', () => {
    expect(codeToMidi('KeyA', 1)).toBe(72)
    expect(codeToMidi('KeyA', -1)).toBe(48)
    expect(codeToMidi('KeyA', -3)).toBe(24)
  })

  it('returns null for keys with no note mapping', () => {
    expect(codeToMidi('Digit1', 0)).toBeNull()
    expect(codeToMidi('Space', 0)).toBeNull()
  })
})

describe('isNoteKey', () => {
  it('is true for every mapped white and black key', () => {
    expect(isNoteKey('KeyA')).toBe(true)
    expect(isNoteKey('KeyW')).toBe(true)
    expect(isNoteKey('Quote')).toBe(true)
  })

  it('is false for unmapped keys, including the octave-shift keys themselves', () => {
    expect(isNoteKey('KeyZ')).toBe(false)
    expect(isNoteKey('KeyX')).toBe(false)
    expect(isNoteKey('ArrowLeft')).toBe(false)
    expect(isNoteKey('ArrowRight')).toBe(false)
    expect(isNoteKey('Escape')).toBe(false)
  })
})

describe('octave-shift keys', () => {
  it('down includes both the letter shortcut and the arrow-key alternative', () => {
    expect(OCTAVE_DOWN_KEYS).toContain('KeyZ')
    expect(OCTAVE_DOWN_KEYS).toContain('ArrowLeft')
  })

  it('up includes both the letter shortcut and the arrow-key alternative', () => {
    expect(OCTAVE_UP_KEYS).toContain('KeyX')
    expect(OCTAVE_UP_KEYS).toContain('ArrowRight')
  })

  it('down and up share no keys with each other', () => {
    const overlap = OCTAVE_DOWN_KEYS.filter((k) => (OCTAVE_UP_KEYS as string[]).includes(k))
    expect(overlap).toEqual([])
  })

  it('none of the octave-shift keys double as note keys', () => {
    for (const code of [...OCTAVE_DOWN_KEYS, ...OCTAVE_UP_KEYS]) {
      expect(isNoteKey(code)).toBe(false)
    }
  })
})

describe('midiToKeyLabel', () => {
  it('is the inverse of codeToMidi for every mapped key at zero octave shift', () => {
    expect(midiToKeyLabel(60, 0)).toBe('A') // middle C
    expect(midiToKeyLabel(61, 0)).toBe('W')
    expect(midiToKeyLabel(77, 0)).toBe("'") // highest-mapped key
  })

  it('follows the octave shift', () => {
    expect(midiToKeyLabel(72, 1)).toBe('A')
    expect(midiToKeyLabel(48, -1)).toBe('A')
  })

  it('is null for a MIDI note not reachable at the given octave shift', () => {
    expect(midiToKeyLabel(60, 1)).toBeNull()
    expect(midiToKeyLabel(59, 0)).toBeNull()
  })
})

describe('reachableMidiRange', () => {
  it('spans exactly the mapped keys at zero octave shift', () => {
    expect(reachableMidiRange(0)).toEqual({ minMidi: 60, maxMidi: 77 })
  })

  it('shifts by a full octave per step, same as codeToMidi', () => {
    expect(reachableMidiRange(1)).toEqual({ minMidi: 72, maxMidi: 89 })
    expect(reachableMidiRange(-1)).toEqual({ minMidi: 48, maxMidi: 65 })
  })

  it('bounds contain every label midiToKeyLabel resolves at that shift', () => {
    const { minMidi, maxMidi } = reachableMidiRange(2)
    for (let midi = minMidi; midi <= maxMidi; midi++) {
      // not every midi in range has a label (there are gaps), but every
      // midi WITH a label must fall inside these bounds
      const label = midiToKeyLabel(midi, 2)
      if (label) {
        expect(midi).toBeGreaterThanOrEqual(minMidi)
        expect(midi).toBeLessThanOrEqual(maxMidi)
      }
    }
    expect(midiToKeyLabel(minMidi - 1, 2)).toBeNull()
    expect(midiToKeyLabel(maxMidi + 1, 2)).toBeNull()
  })
})
