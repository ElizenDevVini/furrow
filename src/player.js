import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { CAMERA_DEFAULT_YAW, GRASS_TOP_Y, TILE_TOP_OFFSET, TREE_POSITIONS } from './scene.js'
import { soilPuff } from './fx.js'

const GLTF_HEIGHT = 1.7
const TARGET_HEIGHT = 1.15
const MODEL_SCALE = TARGET_HEIGHT / GLTF_HEIGHT
const BREATHE_RATE = 1.4
const BREATHE_AMOUNT = 0.01
const MOVE_SPEED = 3.0
const TURN_LERP = 12
const Y_FOLLOW_LERP = 14
const BOUND = 4.15
const SILO_RADIUS = 0.75
const TREE_RADIUS = 0.5
const TILE_HALF = 0.65
const ARRIVE_EPS = 0.05
const FOCUS_PROBE_DIST = 0.5
const FOCUS_RADIUS = 1.25
const STEP_INTERVAL = 0.34
const STEP_SPEED_GATE = 0.3
const LOCOMOTION_FADE = 0.18
const HARVEST_TIMESCALE = 1.7
const PLANT_TIMESCALE = 2.2
const HARVEST_HOLD_S = 1.5
const PLANT_HOLD_S = 1.6
const ACTION_MID_S = 0.55
const SPAWN = { x: 0, z: 3.85 }

const UP = new THREE.Vector3(0, 1, 0)
const TWO_PI = Math.PI * 2

const KEY_AXES = {
  KeyW: { forward: 1 },
  ArrowUp: { forward: 1 },
  KeyS: { forward: -1 },
  ArrowDown: { forward: -1 },
  KeyA: { right: -1 },
  ArrowLeft: { right: -1 },
  KeyD: { right: 1 },
  ArrowRight: { right: 1 }
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v))
}

function lerpAngle(current, target, t) {
  let diff = (target - current) % TWO_PI
  if (diff > Math.PI) diff -= TWO_PI
  if (diff < -Math.PI) diff += TWO_PI
  return current + diff * t
}

function pushOutOfCircle(x, z, cx, cz, r) {
  const dx = x - cx
  const dz = z - cz
  const dist = Math.hypot(dx, dz)
  if (dist >= r) return { x, z }
  if (dist < 1e-6) return { x: cx + r, z: cz }
  const scale = r / dist
  return { x: cx + dx * scale, z: cz + dz * scale }
}

async function loadFarmer(url) {
  const gltf = await new GLTFLoader().loadAsync(url)
  const model = gltf.scene
  model.scale.setScalar(MODEL_SCALE)

  model.traverse((obj) => {
    if (!obj.isSkinnedMesh) return
    obj.castShadow = true
    obj.frustumCulled = false
    obj.material = new THREE.MeshStandardMaterial({
      map: obj.material.map,
      roughness: 1,
      metalness: 0
    })
  })

  const mixer = new THREE.AnimationMixer(model)
  const clip = (pred) => gltf.animations.find(pred)
  const walkClip = clip((c) => c.name.includes('Walk'))
  const walk = mixer.clipAction(walkClip)
  const harvest = mixer.clipAction(clip((c) => c.name === 'Harvest'))
  const plant = mixer.clipAction(clip((c) => c.name === 'Plant'))

  // the bundled Idle clip reads as slumped through its whole loop rather
  // than at one bad frame, so the resting pose holds the walk cycle's own
  // first frame instead -- upright, hands at sides, face toward the camera.
  // it needs its own action (a cloned clip) so it can crossfade independently
  // of the walk action's advancing time.
  const rest = mixer.clipAction(walkClip.clone())
  rest.timeScale = 0

  for (const action of [harvest, plant]) {
    action.setLoop(THREE.LoopOnce, 1)
    action.clampWhenFinished = true
  }
  harvest.timeScale = HARVEST_TIMESCALE
  plant.timeScale = PLANT_TIMESCALE

  return { model, mixer, walk, rest, harvest, plant }
}

export function createPlayer({ scene, camera, sceneApi, tiles, getPlant, hasSeed, onPlant, onHarvest, onToast, audio }) {
  const group = new THREE.Group()
  group.position.set(SPAWN.x, GRASS_TOP_Y, SPAWN.z)
  group.rotation.y = CAMERA_DEFAULT_YAW
  scene.add(group)

  let rig = null
  let activeAction = null
  let busy = false
  let pendingAction = null
  let focusedTile = -1
  let speedRatio = 0
  let stepTimer = 0
  let wasMoving = false
  let firstStepPending = false
  let breatheT = Math.random() * 10
  const pressed = new Set()
  let clickTarget = null
  let clickArrive = null

  loadFarmer(import.meta.env.BASE_URL + 'assets/farmer.glb').then((loaded) => {
    rig = loaded
    group.add(rig.model)
    activeAction = rig.rest
    rig.rest.play()
  })

  window.addEventListener('keydown', (event) => {
    if (!(event.code in KEY_AXES)) return
    event.preventDefault()
    pressed.add(event.code)
    clickTarget = null
    clickArrive = null
  })
  window.addEventListener('keyup', (event) => {
    pressed.delete(event.code)
  })

  // crossFadeFrom only schedules a weight ramp -- it never activates the
  // incoming action in the mixer, so without an explicit play() here every
  // action past the first stays frozen at time 0 with no influence on the
  // skeleton while the outgoing action fades out from under it.
  function fadeTo(action, duration) {
    if (!action || activeAction === action) return
    action.crossFadeFrom(activeAction, duration, false)
    action.play()
    activeAction = action
  }

  function readInputDir() {
    let right = 0
    let forward = 0
    for (const code of pressed) {
      const axis = KEY_AXES[code]
      right += axis.right ?? 0
      forward += axis.forward ?? 0
    }
    if (!right && !forward) return null

    const camForward = new THREE.Vector3()
    camera.getWorldDirection(camForward)
    camForward.y = 0
    camForward.normalize()
    const camRight = new THREE.Vector3().crossVectors(camForward, UP).normalize()

    const dir = camForward.multiplyScalar(forward).add(camRight.multiplyScalar(right))
    return dir.lengthSq() > 0 ? dir.normalize() : null
  }

  function readClickDir() {
    if (!clickTarget) return null
    const dx = clickTarget.x - group.position.x
    const dz = clickTarget.z - group.position.z
    const dist = Math.hypot(dx, dz)
    if (dist <= ARRIVE_EPS) {
      const arrive = clickArrive
      clickTarget = null
      clickArrive = null
      arrive?.()
      return null
    }
    return new THREE.Vector3(dx / dist, 0, dz / dist)
  }

  function applyMovement(dir, dt) {
    let x = group.position.x + dir.x * MOVE_SPEED * dt
    let z = group.position.z + dir.z * MOVE_SPEED * dt
    x = clamp(x, -BOUND, BOUND)
    z = clamp(z, -BOUND, BOUND)
    ;({ x, z } = pushOutOfCircle(x, z, sceneApi.silo.position.x, sceneApi.silo.position.z, SILO_RADIUS))
    for (const tree of TREE_POSITIONS) ({ x, z } = pushOutOfCircle(x, z, tree.x, tree.z, TREE_RADIUS))

    group.position.x = x
    group.position.z = z

    const targetYaw = Math.atan2(dir.x, dir.z)
    group.rotation.y = lerpAngle(group.rotation.y, targetYaw, Math.min(1, dt * TURN_LERP))
  }

  function surfaceY() {
    for (const tile of tiles) {
      if (Math.abs(group.position.x - tile.position.x) <= TILE_HALF && Math.abs(group.position.z - tile.position.z) <= TILE_HALF) {
        return tile.position.y + TILE_TOP_OFFSET
      }
    }
    return GRASS_TOP_Y
  }

  function updateLocomotionFeel(dt, moving) {
    speedRatio += ((moving ? 1 : 0) - speedRatio) * Math.min(1, dt * 8)
    if (moving && !wasMoving) firstStepPending = true
    wasMoving = moving

    if (speedRatio <= STEP_SPEED_GATE) {
      stepTimer = 0
      return
    }
    stepTimer += dt * speedRatio
    if (stepTimer < STEP_INTERVAL) return
    stepTimer = 0
    audio?.play('step', { volume: 0.5 + Math.random() * 0.3, rate: 0.92 + Math.random() * 0.16 })
    if (firstStepPending) {
      firstStepPending = false
      const p = group.position.clone()
      p.y += 0.03
      soilPuff(scene, p, { count: 3 })
    }
  }

  function updatePendingAction(dt) {
    if (!pendingAction) return
    pendingAction.elapsed += dt
    if (!pendingAction.midFired && pendingAction.elapsed >= ACTION_MID_S) {
      pendingAction.midFired = true
      pendingAction.onMid()
    }
    if (pendingAction.elapsed >= pendingAction.holdAt) {
      pendingAction = null
      busy = false
      fadeTo(rig.rest, LOCOMOTION_FADE)
    }
  }

  function computeFocusedTile() {
    const forward = new THREE.Vector3(Math.sin(group.rotation.y), 0, Math.cos(group.rotation.y))
    const probeX = group.position.x + forward.x * FOCUS_PROBE_DIST
    const probeZ = group.position.z + forward.z * FOCUS_PROBE_DIST

    let best = -1
    let bestDist = FOCUS_RADIUS
    for (const tile of tiles) {
      const d = Math.hypot(tile.position.x - probeX, tile.position.z - probeZ)
      if (d < bestDist) {
        bestDist = d
        best = tile.userData.tile
      }
    }
    return best
  }

  function playOneShot(action, holdAt) {
    busy = true
    action.reset()
    fadeTo(action, LOCOMOTION_FADE)
    pendingAction = { elapsed: 0, midFired: false, holdAt, onMid: null }
    return pendingAction
  }

  function act() {
    if (!rig || busy) return
    if (focusedTile < 0) {
      onToast?.('nothing here')
      return
    }
    const plant = getPlant?.(focusedTile)
    if (!plant) {
      if (!hasSeed?.()) {
        onToast?.('nothing here')
        return
      }
      playOneShot(rig.plant, PLANT_HOLD_S).onMid = () => onPlant?.(focusedTile)
      return
    }
    if (plant.stage === 3) {
      playOneShot(rig.harvest, HARVEST_HOLD_S).onMid = () => onHarvest?.(focusedTile)
      return
    }
    onToast?.('still growing')
  }

  function setTarget(pos, onArrive) {
    clickTarget = { x: pos.x, z: pos.z }
    clickArrive = onArrive
  }

  // the rest pose is a frozen frame (walk.timeScale stays 0), so it needs its
  // own procedural life -- a slow scale.y wobble standing in for a breath.
  function updateBreathe(dt, resting) {
    breatheT += dt
    const wobble = resting ? Math.sin(breatheT * BREATHE_RATE) * BREATHE_AMOUNT : 0
    rig.model.scale.y = MODEL_SCALE * (1 + wobble)
  }

  function update(dt) {
    if (!rig) return
    updatePendingAction(dt)

    // act() can fire synchronously from readClickDir's onArrive callback
    // (setTarget's arrive handler is player.act itself), which flips busy
    // mid-frame -- re-check before touching locomotion so the one-shot that
    // just started doesn't get crossfaded back out to idle immediately.
    let moving = false
    if (!busy) {
      const dir = readInputDir() ?? readClickDir()
      if (!busy && dir) {
        applyMovement(dir, dt)
        moving = true
      }
    }
    if (!busy) {
      fadeTo(moving ? rig.walk : rig.rest, LOCOMOTION_FADE)
      rig.walk.timeScale = Math.max(0.05, speedRatio * 1.25)
    }
    updateBreathe(dt, !busy && !moving)

    group.position.y += (surfaceY() - group.position.y) * Math.min(1, dt * Y_FOLLOW_LERP)
    updateLocomotionFeel(dt, moving)
    focusedTile = computeFocusedTile()
    rig.mixer.update(dt)
  }

  return {
    group,
    update,
    setTarget,
    act,
    get focusedTile() {
      return focusedTile
    },
    get busy() {
      return busy
    },
    get speedRatio() {
      return speedRatio
    }
  }
}
