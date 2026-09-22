import * as Tone from 'tone'

// Publicly hosted Salamander Grand Piano samples used in Tone.js's own docs/examples.
// Tone.Sampler pitch-shifts nearby semitones from these anchor samples, so a
// modest set here still covers the full keyboard range convincingly.
const SAMPLE_URLS: Record<string, string> = {
  A1: 'A1.mp3', C2: 'C2.mp3', 'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3',
  A2: 'A2.mp3', C3: 'C3.mp3', 'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3',
  A3: 'A3.mp3', C4: 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3',
  A4: 'A4.mp3', C5: 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3',
  A5: 'A5.mp3', C6: 'C6.mp3', 'D#6': 'Ds6.mp3', 'F#6': 'Fs6.mp3',
  A6: 'A6.mp3', C7: 'C7.mp3',
}
const SAMPLE_BASE_URL = 'https://tonejs.github.io/audio/salamander/'

export class PianoEngine {
  private sampler: Tone.Sampler
  private ready = false
  private loadPromise: Promise<void> | null = null

  constructor() {
    this.sampler = new Tone.Sampler({ urls: SAMPLE_URLS, baseUrl: SAMPLE_BASE_URL })
    this.sampler.toDestination()
  }

  /** Must be called after a user gesture (browser audio-unlock rule) and once before playback. */
  async init(): Promise<void> {
    if (this.ready) return
    if (!this.loadPromise) {
      this.loadPromise = (async () => {
        await Tone.start()
        await Tone.loaded()
        this.ready = true
      })()
    }
    return this.loadPromise
  }

  isReady(): boolean {
    return this.ready
  }

  noteOn(midi: number, velocity = 0.8): void {
    if (!this.ready) return
    this.sampler.triggerAttack(Tone.Frequency(midi, 'midi').toNote(), undefined, velocity)
  }

  noteOff(midi: number): void {
    if (!this.ready) return
    this.sampler.triggerRelease(Tone.Frequency(midi, 'midi').toNote())
  }

  /** Plays a note for a fixed duration - used for auto-playback (listen mode). */
  noteOnFor(midi: number, durationSeconds: number, velocity = 0.8): void {
    if (!this.ready) return
    this.sampler.triggerAttackRelease(
      Tone.Frequency(midi, 'midi').toNote(),
      durationSeconds,
      undefined,
      velocity,
    )
  }

  stopAll(): void {
    this.sampler.releaseAll()
  }
}
