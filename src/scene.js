import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { TIMING, spring } from './anim.js'

export const GRASS_TOP_Y = 0.12
const TILE_REST_Y = 0.12
export const TILE_TOP_OFFSET = 0.09
export const CAMERA_DEFAULT_YAW = -0.6

export const SILO_POS = { x: 3.4, z: -3.4 }
export const TREE_POSITIONS = [
  { x: -3.5, z: -3.4 },
  { x: -2.6, z: -3.8 }
]

function addLights(scene) {
  const hemi = new THREE.HemisphereLight('#fff6e8', '#9fb894', 0.9)
  scene.add(hemi)

  const sun = new THREE.DirectionalLight('#fff1d6', 1.6)
  sun.position.set(6, 10, 4)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -9
  sun.shadow.camera.right = 9
  sun.shadow.camera.top = 9
  sun.shadow.camera.bottom = -9
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 30
  sun.shadow.bias = -0.0004
  sun.shadow.radius = 4
  sun.shadow.normalBias = 0.02
  scene.add(sun)

  return { hemi, sun }
}

// a 4-minute loop that never goes dark: morning -> midday -> golden hour ->
// back to morning. golden hour's low sun position is what gives the long
// shadows, no separate shadow-length parameter needed.
const DAY_KEYFRAMES = [
  {
    name: 'morning',
    sunColor: '#fff1d6',
    sunPos: [6, 10, 4],
    sunIntensity: 1.6,
    hemiSky: '#fff6e8',
    hemiGround: '#9fb894',
    hemiIntensity: 0.9,
    fog: '#f4eee3'
  },
  {
    name: 'midday',
    sunColor: '#ffffff',
    sunPos: [2, 15, 1],
    sunIntensity: 1.9,
    hemiSky: '#ffffff',
    hemiGround: '#a9c9a0',
    hemiIntensity: 1.05,
    fog: '#f7f4ec'
  },
  {
    name: 'golden hour',
    sunColor: '#ffb066',
    sunPos: [9, 4, 6],
    sunIntensity: 1.4,
    hemiSky: '#ffd9a8',
    hemiGround: '#c9a978',
    hemiIntensity: 0.85,
    fog: '#f3e3cf'
  }
]

const dcColorA = new THREE.Color()
const dcColorB = new THREE.Color()
const dcPosA = new THREE.Vector3()
const dcPosB = new THREE.Vector3()
const dcFogA = new THREE.Color()
const dcFogB = new THREE.Color()

// t is 0..1 through the day loop. returns the active keyframe's name for
// the "day 1 · morning" label.
function updateDayCycle(refs, t) {
  const n = DAY_KEYFRAMES.length
  const scaled = ((t % 1) + 1) % 1 * n
  const idx = Math.floor(scaled) % n
  const frac = scaled - Math.floor(scaled)
  const a = DAY_KEYFRAMES[idx]
  const b = DAY_KEYFRAMES[(idx + 1) % n]

  dcColorA.set(a.sunColor)
  dcColorB.set(b.sunColor)
  refs.sun.color.copy(dcColorA).lerp(dcColorB, frac)
  refs.sun.intensity = a.sunIntensity + (b.sunIntensity - a.sunIntensity) * frac
  dcPosA.set(...a.sunPos)
  dcPosB.set(...b.sunPos)
  refs.sun.position.lerpVectors(dcPosA, dcPosB, frac)

  dcColorA.set(a.hemiSky)
  dcColorB.set(b.hemiSky)
  refs.hemi.color.copy(dcColorA).lerp(dcColorB, frac)
  dcColorA.set(a.hemiGround)
  dcColorB.set(b.hemiGround)
  refs.hemi.groundColor.copy(dcColorA).lerp(dcColorB, frac)
  refs.hemi.intensity = a.hemiIntensity + (b.hemiIntensity - a.hemiIntensity) * frac

  dcFogA.set(a.fog)
  dcFogB.set(b.fog)
  const fogColor = dcFogA.lerp(dcFogB, frac)
  refs.scene.fog.color.copy(fogColor)
  refs.scene.background.copy(fogColor)

  return a.name
}

function addIsland(farm) {
  const slabMat = new THREE.MeshStandardMaterial({ color: '#e2d6c3', roughness: 1, metalness: 0 })
  const slab = new THREE.Mesh(new RoundedBoxGeometry(9, 1.2, 9, 4, 0.35), slabMat)
  slab.position.y = -0.6
  slab.receiveShadow = true
  farm.add(slab)

  const grassMat = new THREE.MeshStandardMaterial({ color: '#a9c9a0', roughness: 1, metalness: 0 })
  const grass = new THREE.Mesh(new RoundedBoxGeometry(8.6, 0.12, 8.6, 4, 0.2), grassMat)
  grass.position.y = GRASS_TOP_Y / 2
  grass.receiveShadow = true
  farm.add(grass)
}

function addTiles(farm) {
  const tiles = []
  const spacing = 1.5
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const mat = new THREE.MeshStandardMaterial({ color: '#b9926b', roughness: 1, metalness: 0 })
      const tile = new THREE.Mesh(new RoundedBoxGeometry(1.3, 0.18, 1.3, 3, 0.08), mat)
      const index = row * 5 + col
      tile.position.set((col - 2) * spacing, TILE_REST_Y, (row - 2) * spacing)
      tile.userData = { tile: index, row, col, restY: TILE_REST_Y }
      tile.castShadow = true
      tile.receiveShadow = true
      tiles.push(tile)
      farm.add(tile)
    }
  }
  return tiles
}

function addSilo(farm) {
  const silo = new THREE.Group()
  silo.name = 'silo'

  const bodyMat = new THREE.MeshStandardMaterial({ color: '#efe6d6', roughness: 1, metalness: 0 })
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.6, 20), bodyMat)
  body.position.y = GRASS_TOP_Y + 0.8
  body.castShadow = true
  silo.add(body)

  const capMat = new THREE.MeshStandardMaterial({ color: '#e06c5b', roughness: 1, metalness: 0 })
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.5, 20), capMat)
  cap.position.y = GRASS_TOP_Y + 1.6 + 0.25
  cap.castShadow = true
  silo.add(cap)

  silo.position.set(SILO_POS.x, 0, SILO_POS.z)
  farm.add(silo)
  return silo
}

function addFence(farm) {
  // runs along the front-left edge of the tile grid (x = -3.65), on the grass
  // strip outside it, so it never crosses a tile.
  const fenceMat = new THREE.MeshStandardMaterial({ color: '#d8c8ad', roughness: 1, metalness: 0 })
  const count = 6
  const spacing = 0.7
  const x = -4.05
  const startZ = -0.1

  for (let i = 0; i < count; i++) {
    const post = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.5, 0.08, 2, 0.02), fenceMat)
    post.position.set(x, GRASS_TOP_Y + 0.25, startZ + i * spacing)
    post.castShadow = true
    farm.add(post)
  }

  const railLength = spacing * (count - 1) + 0.1
  const railZ = startZ + (spacing * (count - 1)) / 2
  const railTop = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, railLength), fenceMat)
  railTop.position.set(x, GRASS_TOP_Y + 0.38, railZ)
  railTop.castShadow = true
  farm.add(railTop)

  const railBottom = railTop.clone()
  railBottom.position.y = GRASS_TOP_Y + 0.18
  farm.add(railBottom)
}

function addTree(farm, x, z) {
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#a07a58', roughness: 1, metalness: 0 })
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.6, 8), trunkMat)
  trunk.position.set(x, GRASS_TOP_Y + 0.3, z)
  trunk.castShadow = true
  farm.add(trunk)

  const foliageMatA = new THREE.MeshStandardMaterial({ color: '#8fc27a', roughness: 1, metalness: 0 })
  const foliageA = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 16), foliageMatA)
  foliageA.position.set(x, GRASS_TOP_Y + 0.75, z)
  foliageA.castShadow = true
  farm.add(foliageA)

  const foliageMatB = new THREE.MeshStandardMaterial({ color: '#a9d38f', roughness: 1, metalness: 0 })
  const foliageB = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 16), foliageMatB)
  foliageB.position.set(x + 0.3, GRASS_TOP_Y + 0.95, z + 0.1)
  foliageB.castShadow = true
  farm.add(foliageB)
}

function addTrees(farm) {
  for (const { x, z } of TREE_POSITIONS) addTree(farm, x, z)
}

// clouds live in the half of the world opposite the camera's default facing
// (camera position angle = yaw, measured the same way the rig computes
// position: x = sin(yaw)*..., z = cos(yaw)*...), so they read as distant
// puffs behind the island instead of blobs in front of the lens. each cloud
// oscillates around a fixed base angle rather than orbiting fully, so it can
// never drift out of that back half.
const CLOUD_ARC_HALF = Math.PI / 2
const CLOUD_DRIFT_AMPLITUDE = CLOUD_ARC_HALF * 0.3

function addClouds(scene) {
  const clouds = []
  const center = CAMERA_DEFAULT_YAW + Math.PI
  const spread = CLOUD_ARC_HALF - CLOUD_DRIFT_AMPLITUDE

  for (let i = 0; i < 5; i++) {
    const cloud = new THREE.Group()
    const baseAngle = center + (Math.random() * 2 - 1) * spread
    const radius = 16 + Math.random() * 6
    const y = 4 + Math.random() * 3

    cloud.userData.baseAngle = baseAngle
    cloud.userData.radius = radius
    cloud.userData.phase = Math.random() * Math.PI * 2
    cloud.userData.speed = 0.008 + Math.random() * 0.012
    cloud.position.set(Math.sin(baseAngle) * radius, y, Math.cos(baseAngle) * radius)

    for (let j = 0; j < 3; j++) {
      const mat = new THREE.MeshBasicMaterial({
        color: '#fbf7ef',
        transparent: true,
        opacity: 0.92,
        fog: false
      })
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.7 + Math.random() * 0.6, 12, 12), mat)
      sphere.position.set(j * 0.9 - 0.9, Math.random() * 0.3, Math.random() * 0.4)
      cloud.add(sphere)
    }

    scene.add(cloud)
    clouds.push(cloud)
  }
  return clouds
}

function updateClouds(clouds, dt) {
  for (const cloud of clouds) {
    cloud.userData.phase += cloud.userData.speed * dt
    const angle = cloud.userData.baseAngle + Math.sin(cloud.userData.phase) * CLOUD_DRIFT_AMPLITUDE
    cloud.position.x = Math.sin(angle) * cloud.userData.radius
    cloud.position.z = Math.cos(angle) * cloud.userData.radius
  }
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v))
}

function createRigState(defaultYaw, defaultPitch, defaultDistance) {
  return {
    yaw: defaultYaw,
    pitch: defaultPitch,
    distance: defaultDistance,
    parallaxYaw: 0,
    parallaxPitch: 0,
    curYaw: defaultYaw,
    curPitch: defaultPitch,
    curDistance: defaultDistance,
    curParallaxYaw: 0,
    curParallaxPitch: 0,
    target: new THREE.Vector3(0, 0.3, 0),
    desiredTarget: new THREE.Vector3(0, 0.3, 0)
  }
}

function bindRigEvents(renderer, state, defaultYaw) {
  let dragging = false
  let lastX = 0
  let lastY = 0

  renderer.domElement.addEventListener('pointermove', (event) => {
    if (dragging) {
      state.yaw = clamp(state.yaw + (event.clientX - lastX) * 0.005, defaultYaw - 0.45, defaultYaw + 0.45)
      state.pitch = clamp(state.pitch - (event.clientY - lastY) * 0.005, 0.4, 0.9)
      lastX = event.clientX
      lastY = event.clientY
      return
    }
    state.parallaxYaw = ((event.clientX / innerWidth) * 2 - 1) * 0.04
    state.parallaxPitch = ((event.clientY / innerHeight) * 2 - 1) * 0.02
  })

  renderer.domElement.addEventListener('pointerdown', (event) => {
    dragging = true
    lastX = event.clientX
    lastY = event.clientY
  })

  window.addEventListener('pointerup', () => {
    dragging = false
  })

  renderer.domElement.addEventListener(
    'wheel',
    (event) => {
      state.distance = clamp(state.distance + event.deltaY * 0.02, 12, 24)
    },
    { passive: true }
  )
}

function updateRig(camera, state, dt) {
  const lerpFactor = Math.min(1, dt * 6)
  state.curYaw += (state.yaw - state.curYaw) * lerpFactor
  state.curPitch += (state.pitch - state.curPitch) * lerpFactor
  state.curDistance += (state.distance - state.curDistance) * lerpFactor
  state.curParallaxYaw += (state.parallaxYaw - state.curParallaxYaw) * lerpFactor
  state.curParallaxPitch += (state.parallaxPitch - state.curParallaxPitch) * lerpFactor
  state.target.lerp(state.desiredTarget, Math.min(1, dt * 4))

  const punchSpring = spring(state.punch, 0, state.punchVelocity, dt, 300, 20)
  state.punch = punchSpring.value
  state.punchVelocity = punchSpring.velocity

  const yaw = state.curYaw + state.curParallaxYaw
  const pitch = state.curPitch + state.curParallaxPitch
  const distance = state.curDistance + state.punch
  camera.position.set(
    state.target.x + distance * Math.sin(yaw) * Math.cos(pitch),
    state.target.y + distance * Math.sin(pitch),
    state.target.z + distance * Math.cos(yaw) * Math.cos(pitch)
  )
  camera.lookAt(state.target)
}

function createCameraRig(renderer, camera) {
  const state = createRigState(CAMERA_DEFAULT_YAW, 0.5, 16)
  state.punch = 0
  state.punchVelocity = 0
  bindRigEvents(renderer, state, CAMERA_DEFAULT_YAW)
  return {
    update: (dt) => updateRig(camera, state, dt),
    setTarget: (vec) => state.desiredTarget.set(vec.x, vec.y + 0.3, vec.z),
    punch: () => {
      state.punch -= TIMING.cameraPunch * state.distance
    }
  }
}

export function createScene(renderer) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#f4eee3')
  scene.fog = new THREE.Fog('#f4eee3', 22, 40)

  const { hemi, sun } = addLights(scene)

  const farm = new THREE.Group()
  scene.add(farm)
  addIsland(farm)
  const tiles = addTiles(farm)
  const silo = addSilo(farm)
  addFence(farm)
  addTrees(farm)
  const clouds = addClouds(scene)

  const camera = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.1, 100)
  const rig = createCameraRig(renderer, camera)

  // followTarget: world position the camera orbit centers on (the player).
  // dayT: 0..1 phase through the day loop; omit to leave lighting as-is.
  function update(dt, followTarget, dayT) {
    updateClouds(clouds, dt)
    if (followTarget) rig.setTarget(followTarget)
    rig.update(dt)
    return dayT == null ? null : updateDayCycle({ scene, hemi, sun }, dayT)
  }

  function tileWorldPos(index) {
    const pos = new THREE.Vector3()
    tiles[index].getWorldPosition(pos)
    pos.y += TILE_TOP_OFFSET
    return pos
  }

  // one-shot downward nudge on landing/kick; the existing hover spring in
  // picking.js pulls it back with its own natural overshoot, so no separate
  // decay timer is needed here.
  function kickTile(index) {
    tiles[index].position.y -= TIMING.tileKick
  }

  return { scene, camera, tiles, silo, update, punch: rig.punch, tileWorldPos, kickTile }
}
