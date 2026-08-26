import * as THREE from 'three'
import { createScene } from './scene.js'
import { createPicking } from './picking.js'
import { updateTweens } from './anim.js'
import { createFarm } from './farm.js'
import { createPlayer } from './player.js'
import { createAudio } from './audio.js'
import { TICKERS } from './plants.js'
import { createSimApi } from './farm-api.js'
import { SEEDS } from './sim.js'
import * as ui from './ui.js'

const TOUCH = matchMedia('(pointer: coarse)').matches

const canvas = document.getElementById('c')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap

const sceneApi = createScene(renderer)
const { scene, camera, tiles, update } = sceneApi
const picking = createPicking(renderer, camera, tiles)
const farm = createFarm({ scene, camera, tiles, sceneApi })
const api = createSimApi()
const audio = createAudio()

function toggleSound() {
  audio.setMuted(!audio.muted)
  ui.setSoundLabel(audio.muted)
}

function doPlant(index) {
  api
    .plant(index, ui.getSelected())
    .then(({ ticker }) => {
      farm.plant(index, ticker)
      audio.play('plant')
      ui.toast(`planted ${ticker} for ${SEEDS[ticker].price.toFixed(4)} eth`)
    })
    .catch((err) => ui.toast(err.message))
}

function doHarvest(index) {
  const p = farm.plants[index]
  if (!p) return
  const ticker = p.ticker
  const before = api.state()
  const beforeShares = before.holdings[ticker]
  const beforeUsd = beforeShares * before.prices[ticker]
  const beforeTotal = before.totalUsd

  // hold the row's display value before api.harvest() mutates sim state,
  // otherwise the per-frame refresh paints the new shares instantly,
  // before the fruit has finished flying there.
  ui.holdPending(ticker)

  api
    .harvest(index)
    .then(({ shares }) => {
      farm.harvest(index, () => ui.holdingsAnchor(ticker), () => {
        audio.play('harvest')
        const snap = api.state()
        ui.countUpHoldings(
          ticker,
          beforeShares,
          snap.holdings[ticker],
          beforeUsd,
          snap.holdings[ticker] * snap.prices[ticker],
          beforeTotal,
          snap.totalUsd
        )
        ui.toast(`harvested ${shares.toFixed(4)} ${ticker}`)
      })
    })
    .catch((err) => {
      ui.releasePending(ticker)
      ui.toast(err.message)
    })
}

const player = createPlayer({
  scene,
  camera,
  sceneApi,
  tiles,
  getPlant: (index) => farm.plants[index],
  hasSeed: () => !!ui.getSelected(),
  onPlant: doPlant,
  onHarvest: doHarvest,
  onToast: (message) => ui.toast(message),
  audio
})

function resize() {
  renderer.setSize(innerWidth, innerHeight)
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)
resize()

ui.initHud({
  tickers: TICKERS,
  seeds: SEEDS,
  api,
  touch: TOUCH,
  onToggleSound: toggleSound,
  onSeedTick: () => audio.play('tick', { volume: 0.35 })
})
ui.setSoundLabel(audio.muted)
ui.selectTicker(TICKERS[0])

const startSnap = api.state()
ui.renderWallet(startSnap)
ui.renderHoldings(startSnap)
startSnap.tiles.forEach((tile, index) => {
  if (tile) farm.restore(index, tile.ticker, tile.stage)
})

// tracks which ready plants have already played the "ready" chime, keyed by
// tile index + plantedAt so a replant on the same tile can fire it again;
// seeded from anything already at stage 3 on load so nothing fires on boot.
const readySeen = new Set()
startSnap.tiles.forEach((tile, index) => {
  if (tile && tile.stage === 3) readySeen.add(`${index}:${tile.plantedAt}`)
})

api.subscribe((snap) => ui.renderWallet(snap))

ui.initStartScreen({
  touch: TOUCH,
  onStart: () => {
    audio.unlock().then(() => audio.music())
    ui.showHud()
  }
})

picking.onTileClick((index) => {
  if (player.focusedTile === index) {
    player.act()
    return
  }

  const tilePos = sceneApi.tileWorldPos(index)
  const charPos = player.group.position
  const dx = tilePos.x - charPos.x
  const dz = tilePos.z - charPos.z
  const dist = Math.hypot(dx, dz)
  const approach =
    dist > 0.001
      ? new THREE.Vector3(tilePos.x - (dx / dist) * 0.95, 0, tilePos.z - (dz / dist) * 0.95)
      : new THREE.Vector3(charPos.x, 0, charPos.z)

  player.setTarget(approach, () => player.act())
})

addEventListener('keydown', (event) => {
  const tickerIndex = Number(event.key) - 1
  if (tickerIndex >= 0 && tickerIndex < TICKERS.length) {
    ui.selectTicker(TICKERS[tickerIndex])
    return
  }
  if (event.code === 'KeyE' || event.code === 'Space') {
    event.preventDefault()
    player.act()
    return
  }
  if (event.key === 'p') {
    sceneApi.punch()
    return
  }
  if (event.key === 'm') {
    toggleSound()
    return
  }
  const hovered = picking.hovered
  if (hovered < 0) return
  if (event.key === 'g') {
    api.skip(hovered)
  } else if (event.key === 'r') {
    farm.removeInstant(hovered)
    api.discard(hovered)
  }
})

function projectTile(index) {
  const pos = sceneApi.tileWorldPos(index)
  pos.project(camera)
  return {
    x: (pos.x * 0.5 + 0.5) * innerWidth,
    y: (-pos.y * 0.5 + 0.5) * innerHeight
  }
}

const GROW_SOUND_RATE = { 1: 0.9, 2: 1.0, 3: 1.1 }

const timer = new THREE.Timer()
let elapsed = 0
renderer.setAnimationLoop(() => {
  timer.update()
  const dt = Math.min(timer.getDelta(), 0.05)
  elapsed += dt

  player.update(dt)
  picking.setFocus(player.focusedTile)
  picking.update(dt)
  farm.update(dt, elapsed)
  updateTweens(dt)

  const day = api.dayInfo()
  const phase = update(dt, player.group.position, day.t)
  if (phase) ui.updateDayLabel(day.day, phase)

  const snap = api.state()
  for (let i = 0; i < snap.tiles.length; i++) {
    const tile = snap.tiles[i]
    const p = farm.plants[i]
    if (tile && p && p.stage < tile.stage) {
      audio.play('grow', { rate: GROW_SOUND_RATE[p.stage + 1] ?? 1.0 })
      farm.grow(i)
    }
    if (tile && tile.stage === 3) {
      const key = `${i}:${tile.plantedAt}`
      if (!readySeen.has(key)) {
        readySeen.add(key)
        if (!document.hidden) audio.play('ready')
      }
    }
  }
  ui.renderWallet(snap)
  ui.renderHoldings(snap)

  const activeIndex = player.focusedTile >= 0 ? player.focusedTile : picking.hovered
  if (activeIndex >= 0) {
    const { x, y } = projectTile(activeIndex)
    ui.updateTileLabel(activeIndex, snap.tiles[activeIndex], x, y)
  } else {
    ui.updateTileLabel(-1, null, 0, 0)
  }

  renderer.render(scene, camera)
})
