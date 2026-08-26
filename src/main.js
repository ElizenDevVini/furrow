import * as THREE from 'three'
import { createScene } from './scene.js'
import { createPicking } from './picking.js'
import { updateTweens } from './anim.js'
import { createFarm } from './farm.js'
import { TICKERS } from './plants.js'
import { createSimApi } from './farm-api.js'
import { SEEDS } from './sim.js'
import * as ui from './ui.js'

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

function resize() {
  renderer.setSize(innerWidth, innerHeight)
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)
resize()

ui.initHud({ tickers: TICKERS, seeds: SEEDS, api })
ui.selectTicker(TICKERS[0])

const startSnap = api.state()
ui.renderWallet(startSnap)
ui.renderHoldings(startSnap)
startSnap.tiles.forEach((tile, index) => {
  if (tile) farm.restore(index, tile.ticker, tile.stage)
})

api.subscribe((snap) => ui.renderWallet(snap))

picking.onTileClick((index) => {
  const p = farm.plants[index]

  if (!p) {
    api
      .plant(index, ui.getSelected())
      .then(({ ticker }) => {
        farm.plant(index, ticker)
        ui.toast(`planted ${ticker} for ${SEEDS[ticker].price.toFixed(4)} eth`)
      })
      .catch((err) => ui.toast(err.message))
    return
  }

  if (p.stage === 3) {
    const ticker = p.ticker
    const before = api.state()
    const beforeShares = before.holdings[ticker]
    const beforeUsd = beforeShares * before.prices[ticker]

    // hold the row's display value before api.harvest() mutates sim state,
    // otherwise the per-frame refresh paints the new shares instantly,
    // before the fruit has finished flying there.
    ui.holdPending(ticker)

    api
      .harvest(index)
      .then(({ shares }) => {
        farm.harvest(index, () => ui.holdingsAnchor(ticker), () => {
          const snap = api.state()
          ui.countUpHoldings(ticker, beforeShares, snap.holdings[ticker], beforeUsd, snap.holdings[ticker] * snap.prices[ticker])
          ui.toast(`harvested ${shares.toFixed(4)} ${ticker}`)
        })
      })
      .catch((err) => {
        ui.releasePending(ticker)
        ui.toast(err.message)
      })
  }
})

addEventListener('keydown', (event) => {
  const tickerIndex = Number(event.key) - 1
  if (tickerIndex >= 0 && tickerIndex < TICKERS.length) {
    ui.selectTicker(TICKERS[tickerIndex])
    return
  }
  if (event.key === 'p') {
    sceneApi.punch()
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

const timer = new THREE.Timer()
let elapsed = 0
renderer.setAnimationLoop(() => {
  timer.update()
  const dt = Math.min(timer.getDelta(), 0.05)
  elapsed += dt
  update(dt, elapsed)
  picking.update(dt)
  farm.update(dt, elapsed)
  updateTweens(dt)

  const snap = api.state()
  for (let i = 0; i < snap.tiles.length; i++) {
    const tile = snap.tiles[i]
    const p = farm.plants[i]
    if (tile && p && p.stage < tile.stage) farm.grow(i)
  }
  ui.renderWallet(snap)
  ui.renderHoldings(snap)

  const hovered = picking.hovered
  if (hovered >= 0) {
    const { x, y } = projectTile(hovered)
    ui.updateTileLabel(hovered, snap.tiles[hovered], x, y)
  } else {
    ui.updateTileLabel(-1, null, 0, 0)
  }

  renderer.render(scene, camera)
})
