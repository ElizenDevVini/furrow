import * as THREE from 'three'
import { createScene } from './scene.js'
import { createPicking } from './picking.js'
import { updateTweens } from './anim.js'

const canvas = document.getElementById('c')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap

const { scene, camera, tiles, update } = createScene(renderer)
const picking = createPicking(renderer, camera, tiles)

function resize() {
  renderer.setSize(innerWidth, innerHeight)
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)
resize()

const clock = new THREE.Clock()
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05)
  const t = clock.elapsedTime
  update(dt, t)
  picking.update(dt)
  updateTweens(dt)
  renderer.render(scene, camera)
})
