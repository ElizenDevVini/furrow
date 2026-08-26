import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { TIMING, spring } from './anim.js'

const GRASS_TOP_Y = 0.12
const TILE_REST_Y = 0.12
export const TILE_TOP_OFFSET = 0.09
const CAMERA_DEFAULT_YAW = -0.6

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

  silo.position.set(3.4, 0, -3.4)
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
  addTree(farm, -3.5, -3.4)
  addTree(farm, -2.6, -3.8)
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
    curParallaxPitch: 0
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
      state.distance = clamp(state.distance + event.deltaY * 0.02, 18, 30)
    },
    { passive: true }
  )
}

function updateRig(camera, target, state, dt) {
  const lerpFactor = Math.min(1, dt * 6)
  state.curYaw += (state.yaw - state.curYaw) * lerpFactor
  state.curPitch += (state.pitch - state.curPitch) * lerpFactor
  state.curDistance += (state.distance - state.curDistance) * lerpFactor
  state.curParallaxYaw += (state.parallaxYaw - state.curParallaxYaw) * lerpFactor
  state.curParallaxPitch += (state.parallaxPitch - state.curParallaxPitch) * lerpFactor

  const punchSpring = spring(state.punch, 0, state.punchVelocity, dt, 300, 20)
  state.punch = punchSpring.value
  state.punchVelocity = punchSpring.velocity

  const yaw = state.curYaw + state.curParallaxYaw
  const pitch = state.curPitch + state.curParallaxPitch
  const distance = state.curDistance + state.punch
  camera.position.set(
    target.x + distance * Math.sin(yaw) * Math.cos(pitch),
    target.y + distance * Math.sin(pitch),
    target.z + distance * Math.cos(yaw) * Math.cos(pitch)
  )
  camera.lookAt(target)
}

function createCameraRig(renderer, camera) {
  const target = new THREE.Vector3(0, 0.3, 0)
  const state = createRigState(CAMERA_DEFAULT_YAW, 0.55, 26)
  state.punch = 0
  state.punchVelocity = 0
  bindRigEvents(renderer, state, CAMERA_DEFAULT_YAW)
  return {
    update: (dt) => updateRig(camera, target, state, dt),
    punch: () => {
      state.punch -= TIMING.cameraPunch * state.distance
    }
  }
}

export function createScene(renderer) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#f4eee3')
  scene.fog = new THREE.Fog('#f4eee3', 22, 40)

  addLights(scene)

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

  function update(dt) {
    updateClouds(clouds, dt)
    rig.update(dt)
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
