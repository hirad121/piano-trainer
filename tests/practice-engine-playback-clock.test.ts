import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PianoEngine } from '../src/audio/pianoEngine'
import type { Song } from '../src/midi/types'
import type { FallingNotesRenderer } from '../src/practice/fallingNotes'
import { PracticeEngine } from '../src/practice/practiceEngine'

const song: Song = {
  name: 'test song',
  notes: [
    { midi: 60, time: 0.0, duration: 0.5, velocity: 0.8, hand: 'right' },
    { midi: 62, time: 0.5, duration: 0.5, velocity: 0.8, hand: 'right' },
    { midi: 64, time: 1.0, duration: 0.5, velocity: 0.8, hand: 'right' },
  ],
  durationSeconds: 1.5,
}

function makeFakePiano() {
  return {
    noteOn: vi.fn(),
    noteOff: vi.fn(),
    noteOnFor: vi.fn(),
    stopAll: vi.fn(),
  }
}

function makeFakeRenderer() {
  return { render: vi.fn(), resize: vi.fn() }
}

describe('PracticeEngine playback clock', () => {
  let now: number

  beforeEach(() => {
    now = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not advance or sound notes before play() is called', () => {
    const piano = makeFakePiano()
    const renderer = makeFakeRenderer()
    const engine = new PracticeEngine(
      piano as unknown as PianoEngine,
      renderer as unknown as FallingNotesRenderer,
    )
    engine.loadSong(song)

    now += 5000
    engine.tick(new Set())

    expect(engine.isPlaying()).toBe(false)
    expect(engine.currentTime()).toBe(0)
    expect(piano.noteOnFor).not.toHaveBeenCalled()
  })

  it('auto-sounds each note in listen mode as the clock passes it', () => {
    const piano = makeFakePiano()
    const renderer = makeFakeRenderer()
    const engine = new PracticeEngine(
      piano as unknown as PianoEngine,
      renderer as unknown as FallingNotesRenderer,
    )
    engine.loadSong(song)
    engine.play()

    now += 600 // 0.6s elapsed: the notes at 0.0 and 0.5 should have fired
    engine.tick(new Set())

    expect(piano.noteOnFor).toHaveBeenCalledTimes(2)
    expect(piano.noteOnFor).toHaveBeenNthCalledWith(1, 60, 0.5, 0.8)
    expect(piano.noteOnFor).toHaveBeenNthCalledWith(2, 62, 0.5, 0.8)
  })

  it('scales elapsed time by the configured speed', () => {
    const piano = makeFakePiano()
    const renderer = makeFakeRenderer()
    const engine = new PracticeEngine(
      piano as unknown as PianoEngine,
      renderer as unknown as FallingNotesRenderer,
    )
    engine.loadSong(song)
    engine.setSpeed(2)
    engine.play()

    now += 500 // 0.5s of real time => 1.0s of song time at 2x speed
    expect(engine.currentTime()).toBeCloseTo(1.0)
  })

  it('pause() freezes the clock and stops all sounding notes', () => {
    const piano = makeFakePiano()
    const renderer = makeFakeRenderer()
    const engine = new PracticeEngine(
      piano as unknown as PianoEngine,
      renderer as unknown as FallingNotesRenderer,
    )
    engine.loadSong(song)
    engine.play()

    now += 300
    engine.pause()
    expect(piano.stopAll).toHaveBeenCalledOnce()
    expect(engine.isPlaying()).toBe(false)

    const frozenTime = engine.currentTime()
    now += 1000 // time passing while paused must not move the clock
    expect(engine.currentTime()).toBe(frozenTime)
  })

  it('seek() jumps the clock and clears anything already sounding', () => {
    const piano = makeFakePiano()
    const renderer = makeFakeRenderer()
    const engine = new PracticeEngine(
      piano as unknown as PianoEngine,
      renderer as unknown as FallingNotesRenderer,
    )
    engine.loadSong(song)
    engine.seek(1.0)

    expect(piano.stopAll).toHaveBeenCalledOnce()
    expect(engine.currentTime()).toBe(1.0)
  })
})
