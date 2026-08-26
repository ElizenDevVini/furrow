import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { TIMING, tween, delay, easings, spring, springVec } from './anim.js'

export const TICKERS = ['TSLA', 'AAPL', 'NVDA', 'MSFT', 'AMZN']

// growth-stage groups (everything past the seed/mound) read too small for a
// 1.3-unit tile, so they get a flat bump; fruit gets an extra bump on top so
// a ready plant reads mostly as fruit filling the tile.
const SPECIES_SCALE = 1.35
const FRUIT_SCALE = 1.2

export const PLANT_SPECS = {
  TSLA: { fruitColor: '#e06c5b', leafColor: '#8fc27a' },
  AAPL: { fruitColor: '#b9e08a', leafColor: '#8fc27a' },
  NVDA: { fruitColor: '#d7ff8a', leafColor: '#7ac142' },
  MSFT: { fruitColor: '#6fa8dc', leafColor: '#8fc27a' },
  AMZN: { fruitColor: '#e8a04a', leafColor: '#8fc27a' }
}

const materialCache = new Map()
function mat(color, extra) {
  const key = extra ? `${color}|${JSON.stringify(extra)}` : color
  let m = materialCache.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, ...extra })
    materialCache.set(key, m)
  }
  return m
}

function mesh(geometry, material, x, y, z) {
  const m = new THREE.Mesh(geometry, material)
  m.position.set(x, y, z)
  m.castShadow = true
  return m
}

// a hinge point: rotation.x folds/unfolds for the grow-in animation.
function leafPivot(x, y, z, restX) {
  const pivot = new THREE.Group()
  pivot.position.set(x, y, z)
  pivot.userData.leaf = true
  pivot.userData.restX = restX
  pivot.rotation.x = restX
  return pivot
}

// offset must be off the fold axis (local X) for rotation.x to sweep it, so
// the leaf sits out along local Z rather than X.
function smallLeaf(x, y, z, restX, offsetZ, color) {
  const pivot = leafPivot(x, y, z, restX)
  const m = mesh(new THREE.SphereGeometry(0.12, 10, 8), mat(color), 0, 0, offsetZ)
  m.scale.set(0.5, 0.25, 1)
  pivot.add(m)
  return pivot
}

function buildStage0() {
  const group = new THREE.Group()
  const soil = mesh(new THREE.SphereGeometry(0.28, 12, 10), mat('#8b6a4b'), 0, 0.098, 0)
  soil.scale.y = 0.35
  group.add(soil)
  group.userData.fruit = []
  return group
}

function buildStage1(ticker) {
  const group = new THREE.Group()
  const stem = mesh(new THREE.CapsuleGeometry(0.035, 0.22, 4, 8), mat('#6fae5e'), 0, 0.145, 0)
  group.add(stem)

  const leafColor = PLANT_SPECS[ticker].leafColor
  const a = smallLeaf(0, 0.16, 0, 0.35, 0.1, leafColor)
  const b = smallLeaf(0, 0.1, 0, 0.35, 0.1, leafColor)
  b.rotation.y = Math.PI
  group.add(a, b)

  group.userData.fruit = []
  group.userData.baseScale = SPECIES_SCALE
  return group
}

function buildTSLA(withFruit) {
  const group = new THREE.Group()
  group.add(mesh(new THREE.CapsuleGeometry(0.05, 1.0, 4, 8), mat('#6fae5e'), 0, 0.55, 0))

  for (let i = 0; i < 3; i++) {
    const y = 0.3 + i * 0.28
    const a = smallLeaf(0, y, 0, 0.5, 0.14, '#8fc27a')
    const b = smallLeaf(0, y, 0, 0.5, 0.14, '#8fc27a')
    b.rotation.y = Math.PI + i * 0.6
    a.rotation.y = i * 0.6
    group.add(a, b)
  }

  group.userData.fruit = []
  if (withFruit) {
    const fruitMat = mat('#e06c5b')
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2
      const berry = mesh(
        new THREE.SphereGeometry(0.09 * FRUIT_SCALE, 8, 8),
        fruitMat,
        Math.cos(angle) * 0.14,
        1.02 + (i % 2) * 0.06,
        Math.sin(angle) * 0.14
      )
      group.add(berry)
      group.userData.fruit.push(berry)
    }
  }
  return group
}

function buildAAPL(withFruit) {
  const group = new THREE.Group()
  group.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.45, 8), mat('#a07a58'), 0, 0.225, 0))

  const canopy = leafPivot(0, 0.45, 0, 0.15)
  canopy.add(mesh(new THREE.SphereGeometry(0.42, 14, 12), mat('#8fc27a'), 0, 0, 0))
  canopy.add(mesh(new THREE.SphereGeometry(0.3, 12, 10), mat('#a9d38f'), 0.28, 0.18, 0.12))
  group.add(canopy)

  group.userData.fruit = []
  if (withFruit) {
    const fruitMat = mat('#b9e08a')
    const stemMat = mat('#a07a58')
    for (let i = 0; i < 4; i++) {
      const theta = (i / 4) * Math.PI * 2 + Math.random() * 0.4
      const phi = 0.5 + Math.random() * 0.5
      const r = 0.4
      const x = Math.sin(phi) * Math.cos(theta) * r
      const y = 0.75 + Math.cos(phi) * r
      const z = Math.sin(phi) * Math.sin(theta) * r
      const apple = mesh(new THREE.SphereGeometry(0.1 * FRUIT_SCALE, 8, 8), fruitMat, x, y, z)
      apple.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.06, 5), stemMat, 0, 0.1, 0))
      group.add(apple)
      group.userData.fruit.push(apple)
    }
  }
  return group
}

function buildNVDA(withFruit) {
  const group = new THREE.Group()
  const bladeMat = mat('#7ac142')
  const blades = []
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2
    // radial placement lives on an outer wrapper: the blade tip sits along
    // local Y, and spinning that same pivot around Y would never move it
    // (a point on a rotation axis is invariant under that axis's rotation),
    // so the fan-out has to happen one level up from the fold hinge.
    const spin = new THREE.Group()
    spin.rotation.y = angle
    const pivot = leafPivot(0, 0.05, 0, 0.45)
    pivot.add(mesh(new THREE.ConeGeometry(0.07, 0.85, 8), bladeMat, 0, 0.42, 0))
    spin.add(pivot)
    group.add(spin)
    blades.push(pivot)
  }

  group.userData.fruit = []
  if (withFruit) {
    const tipMat = mat('#d7ff8a', { emissive: '#d7ff8a', emissiveIntensity: 0.7 })
    for (const pivot of blades) {
      const tip = mesh(new THREE.SphereGeometry(0.06 * FRUIT_SCALE, 8, 8), tipMat, 0, 0.85, 0)
      pivot.add(tip)
      group.userData.fruit.push(tip)
    }
  }
  return group
}

function buildMSFT(withFruit) {
  const group = new THREE.Group()
  const base = leafPivot(0, 0.05, 0, 0.25)
  const leafMat = mat('#8fc27a')
  const a = mesh(new THREE.SphereGeometry(0.12, 10, 8), leafMat, 0, 0, 0.1)
  a.scale.set(0.5, 0.25, 1)
  const b = mesh(new THREE.SphereGeometry(0.12, 10, 8), leafMat, 0, 0, -0.1)
  b.scale.set(0.5, 0.25, 1)
  base.add(a, b)
  group.add(base)

  group.userData.fruit = []
  if (withFruit) {
    const cubeMat = mat('#6fa8dc')
    for (const dx of [-0.14, 0.14]) {
      for (const dz of [-0.14, 0.14]) {
        const cube = mesh(
          new RoundedBoxGeometry(0.26 * FRUIT_SCALE, 0.26 * FRUIT_SCALE, 0.26 * FRUIT_SCALE, 2, 0.06 * FRUIT_SCALE),
          cubeMat,
          dx,
          0.18,
          dz
        )
        group.add(cube)
        group.userData.fruit.push(cube)
      }
    }
  }
  return group
}

function buildAMZN(withFruit) {
  const group = new THREE.Group()
  const vineMat = mat('#a07a58')
  const segments = 3
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments
    const t1 = (i + 1) / segments
    const x0 = -0.2 + t0 * 0.4
    const x1 = -0.2 + t1 * 0.4
    const y0 = 0.05 + Math.sin(t0 * Math.PI) * 0.1
    const y1 = 0.05 + Math.sin(t1 * Math.PI) * 0.1
    const midX = (x0 + x1) / 2
    const midY = (y0 + y1) / 2
    const len = Math.hypot(x1 - x0, y1 - y0)
    const seg = mesh(new THREE.CylinderGeometry(0.02, 0.02, len, 5), vineMat, midX, midY, 0)
    seg.rotation.z = Math.PI / 2 - Math.atan2(y1 - y0, x1 - x0)
    group.add(seg)

    const pivot = leafPivot(midX, midY + 0.06, 0, 0.3)
    const lf = mesh(new THREE.SphereGeometry(0.1, 8, 8), mat('#8fc27a'), 0, 0, 0.08)
    lf.scale.set(1, 0.25, 0.5)
    pivot.add(lf)
    group.add(pivot)
  }

  group.userData.fruit = []
  if (withFruit) {
    const gourd = mesh(new THREE.SphereGeometry(0.3 * FRUIT_SCALE, 12, 10), mat('#e8a04a'), 0, 0.3, 0.15)
    gourd.scale.y = 0.7
    gourd.add(mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.08, 6), mat('#a07a58'), 0, 0.24, 0))
    group.add(gourd)
    group.userData.fruit.push(gourd)
  }
  return group
}

const SPECIES_BUILDERS = { TSLA: buildTSLA, AAPL: buildAAPL, NVDA: buildNVDA, MSFT: buildMSFT, AMZN: buildAMZN }

function measureHeight(group) {
  group.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(group)
  if (!isFinite(box.min.y) || !isFinite(box.max.y)) return 0
  return box.max.y - box.min.y
}

function buildSpeciesStage(ticker, withFruit) {
  const group = SPECIES_BUILDERS[ticker](withFruit)
  group.userData.baseScale = (withFruit ? 1 : 0.65) * SPECIES_SCALE
  // measured before the stage is scaled down to 0.001 for its pop-in tween,
  // so this is the raw geometry height at scale 1, times the final baseScale.
  group.userData.height = measureHeight(group) * group.userData.baseScale
  return group
}

function collectLeaves(group) {
  const leaves = []
  group.traverse((obj) => {
    if (obj.userData.leaf) leaves.push(obj)
  })
  return leaves
}

function setStagePlant(plant, n) {
  const prevIndex = plant.stage
  const target = plant.stages[n]
  plant.stage = n
  target.visible = true
  target.scale.setScalar(0.001)

  const leaves = collectLeaves(target)
  leaves.forEach((lf) => {
    lf.rotation.x = lf.userData.restX - 1.2
    lf.userData.leafOpen = false
    lf.userData.leafVel = 0
  })
  plant.activeLeaves = leaves
  leaves.forEach((lf, i) => {
    delay(i * TIMING.leafStaggerMs).then(() => {
      lf.userData.leafOpen = true
    })
  })

  plant.fruit = target.userData.fruit

  const targetBase = target.userData.baseScale ?? 1
  const growPromise = tween({
    from: 0,
    to: 1,
    duration: TIMING.growPopMs / 1000,
    ease: easings.outBack,
    onUpdate: (v) => target.scale.setScalar(Math.max(0.001, v * targetBase))
  })

  let shrinkPromise = Promise.resolve()
  if (prevIndex >= 0 && prevIndex !== n) {
    const old = plant.stages[prevIndex]
    const oldBase = old.userData.baseScale ?? 1
    shrinkPromise = tween({
      from: oldBase,
      to: 0,
      duration: TIMING.shrinkOutMs / 1000,
      ease: easings.inOutSine,
      onUpdate: (v) => old.scale.setScalar(v),
      onComplete: () => {
        old.visible = false
      }
    })
  }

  return Promise.all([growPromise, shrinkPromise])
}

// used by farm.restore to place a plant at a stage with no drop and no pop,
// e.g. rebuilding the farm from saved sim state on page load.
function restoreStagePlant(plant, n) {
  plant.stage = n
  plant.stages.forEach((s, i) => {
    s.visible = i === n
    s.scale.setScalar(i === n ? (s.userData.baseScale ?? 1) : 0.001)
  })

  const target = plant.stages[n]
  const leaves = collectLeaves(target)
  leaves.forEach((lf) => {
    lf.rotation.x = lf.userData.restX
    lf.userData.leafOpen = true
    lf.userData.leafVel = 0
  })
  plant.activeLeaves = leaves
  plant.fruit = target.userData.fruit
}

const ONE = new THREE.Vector3(1, 1, 1)

function updatePlant(plant, dt, t) {
  springVec(plant.squashScale, ONE, plant.squashVel, dt, 260, 14)

  if (!plant.frozen) {
    plant.rotation.z = Math.sin(t * 1.3 + plant.phase) * 0.03
    const breathe = 1 + Math.sin(t * 0.7 + plant.phase) * 0.01
    plant.scale.set(plant.squashScale.x, breathe * plant.squashScale.y, plant.squashScale.z)

    plant.position.y =
      plant.stage === 3
        ? plant.restY + 0.02 + Math.sin(t * 2.2 + plant.phase) * 0.02
        : plant.restY
  }

  for (const lf of plant.activeLeaves) {
    const target = lf.userData.leafOpen ? lf.userData.restX : lf.userData.restX - 1.2
    const s = spring(lf.rotation.x, target, lf.userData.leafVel, dt, 140, 12)
    lf.rotation.x = s.value
    lf.userData.leafVel = s.velocity
  }
}

export function createPlant(ticker) {
  const plant = new THREE.Group()
  plant.ticker = ticker
  plant.phase = Math.random() * Math.PI * 2
  plant.stage = -1
  plant.fruit = []
  plant.activeLeaves = []
  plant.restY = 0
  plant.frozen = false
  plant.squashScale = new THREE.Vector3(1, 1, 1)
  plant.squashVel = new THREE.Vector3()

  plant.stages = [
    buildStage0(),
    buildStage1(ticker),
    buildSpeciesStage(ticker, false),
    buildSpeciesStage(ticker, true)
  ]
  plant.stages.forEach((s) => {
    s.visible = false
    s.scale.setScalar(0.001)
    s.userData.fruit = s.userData.fruit ?? []
    plant.add(s)
  })

  plant.setStage = (n) => setStagePlant(plant, n)
  plant.restoreStage = (n) => restoreStagePlant(plant, n)
  plant.squash = () => plant.squashScale.set(TIMING.squashXZ, TIMING.squashY, TIMING.squashXZ)
  plant.update = (dt, t) => updatePlant(plant, dt, t)

  return plant
}

export function createSeed(ticker) {
  const seed = mesh(new THREE.CapsuleGeometry(0.06, 0.14, 4, 8), mat(PLANT_SPECS[ticker].fruitColor), 0, 0, 0)
  return seed
}
