import * as THREE from 'three'
import { TIMING, spring } from './anim.js'

function edgeNeighbors(tiles, index) {
  const { row, col } = tiles[index].userData
  return tiles.filter((t) => Math.abs(t.userData.row - row) + Math.abs(t.userData.col - col) === 1)
}

function bindPointerEvents(renderer, pointer, raycastTiles, state) {
  let isDown = false
  let dragged = false
  const downPos = new THREE.Vector2()

  function setPointer(event) {
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  }

  renderer.domElement.addEventListener('pointermove', (event) => {
    setPointer(event)
    if (isDown) {
      if (downPos.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 5) dragged = true
      return
    }
    state.hovered = raycastTiles()
    renderer.domElement.style.cursor = state.hovered >= 0 ? 'pointer' : 'default'
  })

  renderer.domElement.addEventListener('pointerdown', (event) => {
    isDown = true
    dragged = false
    downPos.set(event.clientX, event.clientY)
  })

  window.addEventListener('pointerup', (event) => {
    isDown = false
    if (dragged) return
    if (event.target !== renderer.domElement) return
    setPointer(event)
    const tile = raycastTiles()
    if (tile >= 0) state.onClick?.(tile)
  })
}

export function createPicking(renderer, camera, tiles) {
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const state = { hovered: -1, onClick: null }
  const velocities = tiles.map(() => 0)
  const baseColors = tiles.map((tile) => tile.material.color.clone())

  function raycastTiles() {
    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster.intersectObjects(tiles, false)
    return hits.length ? hits[0].object.userData.tile : -1
  }

  bindPointerEvents(renderer, pointer, raycastTiles, state)

  function update(dt) {
    const neighbors = state.hovered >= 0 ? edgeNeighbors(tiles, state.hovered) : []
    tiles.forEach((tile, i) => {
      const rest = tile.userData.restY
      let target = rest
      if (i === state.hovered) target = rest + TIMING.hoverLift
      else if (neighbors.includes(tile)) target = rest - 0.02

      const s = spring(tile.position.y, target, velocities[i], dt, TIMING.hoverStiffness, TIMING.hoverDamping)
      tile.position.y = s.value
      velocities[i] = s.velocity

      const brighter = baseColors[i].clone().lerp(new THREE.Color('#ffffff'), 0.02)
      const targetColor = i === state.hovered ? brighter : baseColors[i]
      tile.material.color.lerp(targetColor, Math.min(1, dt * 10))
    })
  }

  return {
    update,
    get hovered() {
      return state.hovered
    },
    onTileClick(fn) {
      state.onClick = fn
    }
  }
}
