import * as THREE from 'three'
import { TIMING, tween, delay, easings } from './anim.js'
import { createPlant, createSeed } from './plants.js'
import { soilPuff, sparkle, flyToScreen } from './fx.js'
import { TILE_TOP_OFFSET } from './scene.js'

export function createFarm({ scene, camera, tiles, sceneApi }) {
  const plants = new Array(tiles.length).fill(null)
  const busy = new Set()
  const fallingSeeds = []

  function plant(index, ticker) {
    if (busy.has(index) || plants[index]) return Promise.resolve(null)
    busy.add(index)

    const tile = tiles[index]
    const landY = tile.userData.restY + TILE_TOP_OFFSET
    const seed = createSeed(ticker)
    seed.position.set(tile.position.x, landY + TIMING.plantDropHeight, tile.position.z)
    scene.add(seed)

    return new Promise((resolve) => {
      fallingSeeds.push({ seed, index, ticker, velocityY: 0, landY, x: tile.position.x, z: tile.position.z, resolve })
    })
  }

  function integrateSeeds(dt) {
    for (let i = fallingSeeds.length - 1; i >= 0; i--) {
      const f = fallingSeeds[i]
      f.velocityY -= TIMING.gravity * dt
      f.seed.position.y += f.velocityY * dt
      if (f.seed.position.y <= f.landY) {
        fallingSeeds.splice(i, 1)
        landSeed(f)
      }
    }
  }

  function landSeed(f) {
    scene.remove(f.seed)
    f.seed.geometry.dispose()

    sceneApi.kickTile(f.index)
    soilPuff(scene, new THREE.Vector3(f.x, f.landY, f.z))

    const newPlant = createPlant(f.ticker)
    newPlant.restY = TILE_TOP_OFFSET
    newPlant.position.y = TILE_TOP_OFFSET
    tiles[f.index].add(newPlant)
    plants[f.index] = newPlant

    newPlant.setStage(0).then(() => busy.delete(f.index))
    newPlant.squash()
    f.resolve(newPlant)
  }

  function grow(index) {
    const p = plants[index]
    if (!p || busy.has(index) || p.stage >= 3) return Promise.resolve()
    busy.add(index)
    return p.setStage(p.stage + 1).then(() => {
      if (p.stage === 3) sparkle(scene, sceneApi.tileWorldPos(index))
      busy.delete(index)
    })
  }

  async function harvest(index, getScreenPoint) {
    const p = plants[index]
    if (!p || busy.has(index) || p.stage !== 3) return
    busy.add(index)

    p.squash()
    await delay(TIMING.harvestAnticipateMs)

    const fruits = p.fruit.slice()
    sceneApi.punch()
    await Promise.all(
      fruits.map(
        (fruitMesh, i) =>
          new Promise((resolve) => {
            delay(i * 60).then(() => flyToScreen(fruitMesh, scene, camera, getScreenPoint, resolve))
          })
      )
    )

    p.frozen = true
    await tween({
      from: 1,
      to: 0,
      duration: TIMING.shrinkOutMs / 1000,
      ease: easings.inOutSine,
      onUpdate: (v) => p.scale.setScalar(v)
    })

    soilPuff(scene, sceneApi.tileWorldPos(index))
    tiles[index].remove(p)
    disposePlant(p)
    plants[index] = null
    busy.delete(index)
  }

  function removeInstant(index) {
    const p = plants[index]
    if (!p) return
    tiles[index].remove(p)
    disposePlant(p)
    plants[index] = null
    busy.delete(index)
  }

  function update(dt, t) {
    for (const p of plants) {
      if (p) p.update(dt, t)
    }
    integrateSeeds(dt)
  }

  return { plants, plant, grow, harvest, removeInstant, update }
}

function disposePlant(plant) {
  plant.traverse((obj) => {
    if (obj.isMesh) obj.geometry.dispose()
  })
}
