import { PianoEngine } from './audio/pianoEngine'
import { KeyboardInput } from './input/keyboardInput'
import { loadMidiFile } from './midi/midiLoader'
import { FallingNotesRenderer, KEYBOARD_HEIGHT_PX } from './practice/fallingNotes'
import { PracticeEngine, type Mode, type ScoreState } from './practice/practiceEngine'
import { isSongUnlocked, loadProgress, recordAttempt, UNLOCK_THRESHOLD_PCT } from './progress'
import { shake } from './shake'
import { songLibrary, type SongEntry } from './songs'

const canvas = document.getElementById('falling-notes-canvas') as HTMLCanvasElement
const fileInput = document.getElementById('midi-file-input') as HTMLInputElement
const startAudioBtn = document.getElementById('start-audio-btn') as HTMLButtonElement
const playPauseBtn = document.getElementById('play-pause-btn') as HTMLButtonElement
const modeSelect = document.getElementById('mode-select') as HTMLSelectElement
const speedSlider = document.getElementById('speed-slider') as HTMLInputElement
const speedLabel = document.getElementById('speed-label') as HTMLSpanElement
const octaveIndicator = document.getElementById('octave-indicator') as HTMLSpanElement
const scoreBadges = document.getElementById('score-badges') as HTMLDivElement
const scoreGoodBadge = document.getElementById('score-good') as HTMLSpanElement
const scoreShortBadge = document.getElementById('score-short') as HTMLSpanElement
const scoreLongBadge = document.getElementById('score-long') as HTMLSpanElement
const scoreMissBadge = document.getElementById('score-miss') as HTMLSpanElement
const scoreWrongBadge = document.getElementById('score-wrong') as HTMLSpanElement
const scoreStreakBadge = document.getElementById('score-streak') as HTMLSpanElement
const statusText = document.getElementById('status-text') as HTMLSpanElement
const octaveDownBtn = document.getElementById('octave-down-btn') as HTMLButtonElement
const octaveUpBtn = document.getElementById('octave-up-btn') as HTMLButtonElement
const helpBtn = document.getElementById('help-btn') as HTMLButtonElement
const helpPanel = document.getElementById('help-panel') as HTMLDivElement
const songsBtn = document.getElementById('songs-btn') as HTMLButtonElement
const songsPanel = document.getElementById('songs-panel') as HTMLDivElement
const songsList = document.getElementById('songs-list') as HTMLDivElement
const countdownOverlay = document.getElementById('countdown-overlay') as HTMLDivElement
const countdownNumber = document.getElementById('countdown-number') as HTMLSpanElement

document.documentElement.style.setProperty('--keyboard-height', `${KEYBOARD_HEIGHT_PX}px`)

const piano = new PianoEngine()
const renderer = new FallingNotesRenderer(canvas)
const activeUserMidi = new Set<number>()
let audioReady = false

// --- song library / unlock progress ---
let progressStore = loadProgress()
// The song currently loaded, if it's one from the library (null for a custom file loaded
// via Load MIDI - those don't participate in progress/unlocking).
let currentSongId: string | null = songLibrary[0].id
// Tracks the previous tick's `finished` so a qualifying clear is recorded exactly once,
// on the false->true edge, not on every tick while the song stays finished. No manual
// reset is needed anywhere: `finished` itself already resets to false on loadSong()/reset()
// (see PracticeEngine), so this naturally re-syncs on the very next tick the same way.
let wasFinished = false

// practice-wait mode is entirely driven by key-matching - there's nothing for
// Play/Pause to control there, so it's disabled and shows Play until the
// first note is matched (currentTime moves past 0), at which point it turns
// into an enabled Reset for the rest of the song - same as once it finishes.
function offersReset(): boolean {
  return practice.isFinished() || (modeSelect.value === 'practice-wait' && practice.currentTime() > 0)
}

// --- pre-start countdown (Play mode only) ---
// A large centered 3-2-1 overlay shown right after Play is pressed in Play mode, before
// actual playback/grading starts - see startPlayCountdown(). `practiceEngine`'s
// `notePressed()` already ignores presses while `!this.playing` (see its comment), so
// keys pressed during the countdown are safely inert rather than scored as wrong.
let countdownActive = false
let countdownTimer: number | undefined

function cancelPlayCountdown(): void {
  if (countdownTimer !== undefined) window.clearTimeout(countdownTimer)
  countdownTimer = undefined
  if (!countdownActive) return
  countdownActive = false
  countdownOverlay.setAttribute('aria-hidden', 'true')
  countdownNumber.classList.remove('countdown-tick')
  countdownNumber.textContent = ''
  updatePlayButton(practice.isPlaying())
}

function startPlayCountdown(onComplete: () => void): void {
  countdownActive = true
  countdownOverlay.setAttribute('aria-hidden', 'false')
  const steps = [3, 2, 1]
  let i = 0
  const step = (): void => {
    if (i >= steps.length) {
      countdownActive = false
      countdownOverlay.setAttribute('aria-hidden', 'true')
      countdownNumber.classList.remove('countdown-tick')
      countdownNumber.textContent = ''
      updatePlayButton(practice.isPlaying())
      onComplete()
      return
    }
    countdownNumber.textContent = String(steps[i])
    countdownNumber.classList.remove('countdown-tick')
    void countdownNumber.offsetWidth // restart the fade animation - see shake.ts for the same trick
    countdownNumber.classList.add('countdown-tick')
    i += 1
    countdownTimer = window.setTimeout(step, 1000)
  }
  updatePlayButton(practice.isPlaying())
  step()
}

function updatePlayButton(playing: boolean): void {
  if (countdownActive) {
    playPauseBtn.disabled = true
    playPauseBtn.classList.add('disabled-look')
    playPauseBtn.textContent = 'Get ready…'
    return
  }
  const reset = offersReset()
  const waitModeIdle = modeSelect.value === 'practice-wait' && !reset
  // Left genuinely (natively) disabled only once audio is ready and it's
  // wait-mode-idle, where there's truly nothing to do yet. Kept clickable but
  // styled as disabled whenever audio isn't ready yet - even in wait-mode-idle,
  // which is the default state on page load - so a click there can still shake
  // Start Audio instead of silently doing nothing (native `disabled` buttons
  // never fire clicks).
  playPauseBtn.disabled = audioReady && waitModeIdle
  playPauseBtn.classList.toggle('disabled-look', !audioReady || waitModeIdle)
  playPauseBtn.textContent = reset ? 'Reset' : playing ? 'Pause' : 'Play'
}

// Count-based, not points-based, and only meaningful in Practice-wait/Play mode (the only
// modes that judge anything) - hidden elsewhere and before the first note is judged.
// Broken into separate colored badges (reusing the hold-feedback color language) rather
// than one dense sentence, so it reads at a glance instead of needing to be parsed; every
// badge but "Good" is only shown once it has something to report, via CSS `:not(:empty)`.
function updateScoreDisplay(score: ScoreState, finished: boolean): void {
  const relevant = (modeSelect.value === 'practice-wait' || modeSelect.value === 'play') && score.totalNotes > 0
  scoreBadges.classList.toggle('complete', relevant && finished)
  if (!relevant) {
    scoreGoodBadge.textContent = ''
    scoreShortBadge.textContent = ''
    scoreLongBadge.textContent = ''
    scoreMissBadge.textContent = ''
    scoreWrongBadge.textContent = ''
    scoreStreakBadge.textContent = ''
    return
  }
  scoreGoodBadge.textContent = `Good ${score.good}`
  scoreShortBadge.textContent = score.short > 0 ? `Short ${score.short}` : ''
  scoreLongBadge.textContent = score.long > 0 ? `Long ${score.long}` : ''
  scoreMissBadge.textContent = score.miss > 0 ? `Miss ${score.miss}` : ''
  scoreWrongBadge.textContent = score.wrong > 0 ? `Wrong ${score.wrong}` : ''
  scoreStreakBadge.textContent =
    score.currentStreak > 0 || score.bestStreak > 0 ? `Streak ${score.currentStreak} (best ${score.bestStreak})` : ''
}

const practice = new PracticeEngine(piano, renderer, ({ playing, finished, score }) => {
  updatePlayButton(playing)
  updateScoreDisplay(score, finished)

  // Record progress on the false->true finish edge only - see `wasFinished`'s comment.
  // Play mode is the real unlock gate: Practice-wait can't structurally fail (it blocks
  // until the right key is held), so only a qualifying Play-mode clear counts.
  if (finished && !wasFinished && currentSongId && modeSelect.value === 'play' && score.totalNotes > 0) {
    const atQualifyingSpeed = Number(speedSlider.value) >= 1
    const pct = Math.round((score.good / score.totalNotes) * 100)
    if (atQualifyingSpeed) {
      progressStore = recordAttempt(progressStore, currentSongId, pct)
      if (pct >= UNLOCK_THRESHOLD_PCT) {
        statusText.textContent = `${pct}% good - next song unlocked!`
        if (songsPanel.classList.contains('open')) renderSongsPanel()
      } else {
        statusText.textContent = `${pct}% good - ${UNLOCK_THRESHOLD_PCT}%+ needed to unlock the next song`
      }
    } else {
      statusText.textContent = `${pct}% good - play at 1x speed or faster to unlock the next song`
    }
  }
  wasFinished = finished
})

practice.loadSong(songLibrary[0].song)
practice.setMode(modeSelect.value as Mode) // sync with the <select>'s default (practice-wait), not the engine's own internal default

function resizeCanvas(): void {
  const rect = canvas.getBoundingClientRect()
  renderer.resize(rect.width, rect.height)
}
window.addEventListener('resize', resizeCanvas)
resizeCanvas()

// --- keyboard-mapping/legend help popover ---
function setHelpOpen(open: boolean): void {
  helpPanel.classList.toggle('open', open)
  helpPanel.setAttribute('aria-hidden', String(!open))
  helpBtn.setAttribute('aria-expanded', String(open))
}
helpBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  setHelpOpen(!helpPanel.classList.contains('open'))
})
document.addEventListener('click', (e) => {
  if (helpPanel.classList.contains('open') && !helpPanel.contains(e.target as Node)) setHelpOpen(false)
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    setHelpOpen(false)
    setSongsOpen(false)
  }
})

// --- song library popover ---
function loadSongEntry(entry: SongEntry): void {
  cancelPlayCountdown()
  practice.loadSong(entry.song)
  currentSongId = entry.id
  statusText.textContent = `Loaded "${entry.title}"`
  setSongsOpen(false)
}

function renderSongsPanel(): void {
  songsList.replaceChildren(
    ...songLibrary.map((entry, index) => {
      const unlocked = isSongUnlocked(index, songLibrary, progressStore)
      const bestPct = progressStore[entry.id]?.bestPct
      const cleared = bestPct !== undefined && bestPct >= UNLOCK_THRESHOLD_PCT

      const row = document.createElement('button')
      row.type = 'button'
      row.className = unlocked ? 'song-row' : 'song-row song-row-locked'
      row.setAttribute('role', 'menuitem')

      const icon = document.createElement('span')
      icon.className = 'song-row-icon'
      icon.textContent = unlocked ? (cleared ? '✓' : '○') : '🔒' // check / circle / lock
      icon.setAttribute('aria-hidden', 'true')

      const title = document.createElement('span')
      title.className = 'song-row-title'
      title.textContent = entry.title

      const difficulty = document.createElement('span')
      difficulty.className = 'song-row-difficulty'
      difficulty.textContent = entry.difficulty

      row.append(icon, title, difficulty)

      if (bestPct !== undefined) {
        const best = document.createElement('span')
        best.className = 'song-row-best'
        best.textContent = `${bestPct}%`
        row.append(best)
      }

      row.addEventListener('click', () => {
        if (unlocked) {
          loadSongEntry(entry)
        } else {
          shake(row)
        }
      })

      return row
    }),
  )
}

function setSongsOpen(open: boolean): void {
  if (open) renderSongsPanel()
  songsPanel.classList.toggle('open', open)
  songsPanel.setAttribute('aria-hidden', String(!open))
  songsBtn.setAttribute('aria-expanded', String(open))
}
songsBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  setSongsOpen(!songsPanel.classList.contains('open'))
})
document.addEventListener('click', (e) => {
  if (songsPanel.classList.contains('open') && !songsPanel.contains(e.target as Node)) setSongsOpen(false)
})

// --- keyboard input: sounds notes live and feeds the wait-mode/Play-mode matcher ---
const keyboardInput = new KeyboardInput({
  onNoteOn: (midi) => {
    activeUserMidi.add(midi)
    piano.noteOn(midi)
    practice.notePressed(midi)
    if (!audioReady) shake(startAudioBtn)
  },
  onNoteOff: (midi) => {
    activeUserMidi.delete(midi)
    piano.noteOff(midi)
    practice.noteReleased(midi)
  },
  onOctaveChange: (shift) => {
    octaveIndicator.textContent = `Octave shift: ${shift}`
  },
})

octaveDownBtn.addEventListener('click', () => keyboardInput.shiftOctaveDown())
octaveUpBtn.addEventListener('click', () => keyboardInput.shiftOctaveUp())

// --- audio unlock (browsers require a user gesture before playing sound) ---
startAudioBtn.addEventListener('click', async () => {
  startAudioBtn.disabled = true
  startAudioBtn.textContent = 'Loading piano…'
  try {
    await piano.init()
    startAudioBtn.textContent = 'Audio ready'
    audioReady = true
    updatePlayButton(practice.isPlaying())
  } catch (err) {
    startAudioBtn.disabled = false
    startAudioBtn.textContent = 'Start Audio'
    statusText.textContent = 'Could not load piano sounds - check your connection.'
    console.error(err)
  }
})

// --- transport controls ---
playPauseBtn.addEventListener('click', () => {
  if (!audioReady || countdownActive) {
    if (!audioReady) shake(startAudioBtn)
    return
  }
  if (offersReset()) {
    practice.reset()
  } else if (modeSelect.value === 'play' && !practice.isPlaying()) {
    startPlayCountdown(() => practice.play())
  } else {
    practice.togglePlay()
  }
})

modeSelect.addEventListener('change', () => {
  cancelPlayCountdown()
  // Switching modes mid-song rewinds to the start rather than continuing from wherever the
  // old mode left off - each mode has its own pacing/matching state (wait-group, due notes,
  // etc.), so resuming mid-song under a different mode would leave that state meaningless
  // (e.g. jumping into practice-wait mid-song with no wait-group established yet).
  practice.reset()
  practice.setMode(modeSelect.value as Mode)
  updatePlayButton(practice.isPlaying())
  updateScoreDisplay(practice.getScore(), practice.isFinished())
})

speedSlider.addEventListener('input', () => {
  const speed = Number(speedSlider.value)
  practice.setSpeed(speed)
  speedLabel.textContent = `${Math.round(speed * 100)}%`
})

// --- MIDI file loading ---
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0]
  if (!file) return
  statusText.textContent = `Loading ${file.name}…`
  try {
    const song = await loadMidiFile(file)
    cancelPlayCountdown()
    practice.loadSong(song)
    currentSongId = null // not a library song - doesn't participate in progress/unlocking
    statusText.textContent = `Loaded "${song.name}" (${song.notes.length} notes)`
  } catch (err) {
    statusText.textContent = `Could not parse ${file.name} as a MIDI file.`
    console.error(err)
  }
})

// --- render/practice loop ---
function frame(): void {
  practice.tick(activeUserMidi, keyboardInput.getOctaveShift())
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
