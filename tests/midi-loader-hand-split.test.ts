import { Midi } from '@tonejs/midi'
import { describe, expect, it } from 'vitest'
import { loadMidiFile } from '../src/midi/midiLoader'

function midiFile(build: (midi: Midi) => void, name = 'song.mid'): File {
  const midi = new Midi()
  build(midi)
  return new File([Buffer.from(midi.toArray())], name)
}

describe('loadMidiFile hand-split heuristic', () => {
  it('assigns the lower-average-pitch track to the left hand when there are 2+ tracks', () => {
    const file = midiFile((midi) => {
      const low = midi.addTrack()
      low.addNote({ midi: 40, time: 0, duration: 0.5 })
      const high = midi.addTrack()
      high.addNote({ midi: 72, time: 0, duration: 0.5 })
    })

    return loadMidiFile(file).then((song) => {
      const hands = new Map(song.notes.map((n) => [n.midi, n.hand]))
      expect(hands.get(40)).toBe('left')
      expect(hands.get(72)).toBe('right')
    })
  })

  it('splits a single track at middle C when there is only one note-track', () => {
    const file = midiFile((midi) => {
      const only = midi.addTrack()
      only.addNote({ midi: 48, time: 0, duration: 0.5 }) // below middle C => left
      only.addNote({ midi: 72, time: 0.5, duration: 0.5 }) // above middle C => right
    })

    return loadMidiFile(file).then((song) => {
      const hands = new Map(song.notes.map((n) => [n.midi, n.hand]))
      expect(hands.get(48)).toBe('left')
      expect(hands.get(72)).toBe('right')
    })
  })

  it('derives the song name from the filename, stripping the extension', () => {
    const file = midiFile((midi) => {
      midi.addTrack().addNote({ midi: 60, time: 0, duration: 0.5 })
    }, 'My Song.mid')

    return loadMidiFile(file).then((song) => {
      expect(song.name).toBe('My Song')
    })
  })

  it('sorts notes ascending by time regardless of track order', () => {
    const file = midiFile((midi) => {
      const a = midi.addTrack()
      a.addNote({ midi: 60, time: 1.0, duration: 0.5 })
      const b = midi.addTrack()
      b.addNote({ midi: 62, time: 0.0, duration: 0.5 })
    })

    return loadMidiFile(file).then((song) => {
      expect(song.notes.map((n) => n.midi)).toEqual([62, 60])
    })
  })
})
