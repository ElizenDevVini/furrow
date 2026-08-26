const STORAGE_KEY = 'furrow/sound'
const NAMES = ['music', 'plant', 'grow', 'harvest', 'ready', 'step', 'tick']
const MUSIC_GAIN = 0.32
const SFX_GAIN = 0.8
const MUSIC_FADE_S = 1.5
const MUTE_RAMP_S = 0.15

function assetUrl(name) {
  return import.meta.env.BASE_URL + `assets/audio/${name}.mp3`
}

export function createAudio() {
  let ctx = null
  let masterGain = null
  let musicGain = null
  let sfxGain = null
  let musicSource = null
  const buffers = {}
  let muted = localStorage.getItem(STORAGE_KEY) === 'off'
  let unlocking = null

  async function loadBuffer(name) {
    try {
      const res = await fetch(assetUrl(name))
      const data = await res.arrayBuffer()
      buffers[name] = await ctx.decodeAudioData(data)
    } catch {
      buffers[name] = null
    }
  }

  function unlock() {
    if (unlocking) return unlocking
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) {
      unlocking = Promise.resolve()
      return unlocking
    }

    ctx = new AudioCtx()
    masterGain = ctx.createGain()
    masterGain.gain.value = muted ? 0 : 1
    masterGain.connect(ctx.destination)

    musicGain = ctx.createGain()
    musicGain.gain.value = 0
    musicGain.connect(masterGain)

    sfxGain = ctx.createGain()
    sfxGain.gain.value = SFX_GAIN
    sfxGain.connect(masterGain)

    unlocking = Promise.all(NAMES.map(loadBuffer)).catch(() => {})
    return unlocking
  }

  function music() {
    if (!ctx || musicSource || !buffers.music) return
    musicSource = ctx.createBufferSource()
    musicSource.buffer = buffers.music
    musicSource.loop = true
    musicSource.connect(musicGain)
    musicSource.start(0)

    const now = ctx.currentTime
    musicGain.gain.cancelScheduledValues(now)
    musicGain.gain.setValueAtTime(0, now)
    musicGain.gain.linearRampToValueAtTime(MUSIC_GAIN, now + MUSIC_FADE_S)
  }

  function play(name, { volume = 1, rate = 1 } = {}) {
    if (!ctx || !buffers[name]) return
    const source = ctx.createBufferSource()
    source.buffer = buffers[name]
    source.playbackRate.value = rate

    const gain = ctx.createGain()
    gain.gain.value = volume
    source.connect(gain)
    gain.connect(sfxGain)
    source.start(0)
  }

  function setMuted(next) {
    muted = next
    localStorage.setItem(STORAGE_KEY, muted ? 'off' : 'on')
    if (!ctx) return
    const now = ctx.currentTime
    masterGain.gain.cancelScheduledValues(now)
    masterGain.gain.setValueAtTime(masterGain.gain.value, now)
    masterGain.gain.linearRampToValueAtTime(muted ? 0 : 1, now + MUTE_RAMP_S)
  }

  return {
    unlock,
    play,
    music,
    get muted() {
      return muted
    },
    setMuted
  }
}
