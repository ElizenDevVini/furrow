import * as THREE from 'three'
import { createScene } from './scene.js'
import { createPicking } from './picking.js'
import { updateTweens } from './anim.js'
import { createFarm } from './farm.js'
import { TICKERS } from './plants.js'

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

function resize() {
  renderer.setSize(innerWidth, innerHeight)
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)
resize()

function harvestScreenPoint() {
  return { x: innerWidth - 140, y: 90 }
}

let selectedTicker = TICKERS[0]
picking.onTileClick((index) => {
  const p = farm.plants[index]
  if (!p) farm.plant(index, selectedTicker)
  else if (p.stage === 3) farm.harvest(index, harvestScreenPoint)
})
addEventListener('keydown', (event) => {
  const tickerIndex = Number(event.key) - 1
  if (tickerIndex >= 0 && tickerIndex < TICKERS.length) {
    selectedTicker = TICKERS[tickerIndex]
    return
  }
  if (event.key === 'p') {
    sceneApi.punch()
    return
  }
  const hovered = picking.hovered
  if (hovered < 0) return
  if (event.key === 'g') farm.grow(hovered)
  else if (event.key === 'r') farm.removeInstant(hovered)
})

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
  renderer.render(scene, camera)
})
