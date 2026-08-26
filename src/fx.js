import * as THREE from 'three'
import { TIMING, tween, easings } from './anim.js'

function disposeTree(object, disposeMaterial) {
  object.traverse((child) => {
    if (!child.isMesh) return
    child.geometry.dispose()
    if (disposeMaterial) child.material.dispose()
  })
}

function burst(scene, worldPos, { count, color, duration, speed, upSpeed, gravity, radius, emissiveIntensity }) {
  for (let i = 0; i < count; i++) {
    const matParams = { color, roughness: 1, metalness: 0, transparent: true }
    if (emissiveIntensity) {
      matParams.emissive = color
      matParams.emissiveIntensity = emissiveIntensity
    }
    const mat = new THREE.MeshStandardMaterial(matParams)
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius(), 8, 8), mat)
    mesh.position.copy(worldPos)
    scene.add(mesh)

    const angle = Math.random() * Math.PI * 2
    const s = speed()
    const vx = Math.cos(angle) * s
    const vz = Math.sin(angle) * s
    const vy = upSpeed()

    tween({
      from: 0,
      to: duration,
      duration,
      ease: easings.linear,
      onUpdate: (t) => {
        mesh.position.set(
          worldPos.x + vx * t,
          worldPos.y + vy * t - 0.5 * gravity * t * t,
          worldPos.z + vz * t
        )
        const life = 1 - t / duration
        mesh.scale.setScalar(Math.max(0, life))
        mat.opacity = Math.max(0, life)
      },
      onComplete: () => {
        scene.remove(mesh)
        disposeTree(mesh, true)
      }
    })
  }
}

export function soilPuff(scene, worldPos, { count = 8 } = {}) {
  burst(scene, worldPos, {
    count,
    color: '#b9926b',
    duration: TIMING.puffMs / 1000,
    speed: () => 0.8 + Math.random() * 1.2,
    upSpeed: () => 1.2 + Math.random() * 1.0,
    gravity: TIMING.gravity,
    radius: () => 0.05 + Math.random() * 0.04
  })
}

export function sparkle(scene, worldPos) {
  burst(scene, worldPos, {
    count: 6,
    color: '#fff6d5',
    duration: 0.3,
    speed: () => 0.6 + Math.random() * 0.6,
    upSpeed: () => 0.6 + Math.random() * 0.4,
    gravity: 2,
    radius: () => 0.03 + Math.random() * 0.02,
    emissiveIntensity: 0.6
  })
}

function targetWorldPos(camera, screenPoint) {
  const forward = new THREE.Vector3()
  camera.getWorldDirection(forward)
  const planePoint = camera.position.clone().addScaledVector(forward, 8)
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(forward, planePoint)

  const ndc = new THREE.Vector3(
    (screenPoint.x / innerWidth) * 2 - 1,
    -(screenPoint.y / innerHeight) * 2 + 1,
    0.5
  )
  ndc.unproject(camera)
  const rayDir = ndc.sub(camera.position).normalize()
  const ray = new THREE.Ray(camera.position, rayDir)
  const out = new THREE.Vector3()
  ray.intersectPlane(plane, out)
  return out ?? planePoint
}

export function flyToScreen(mesh, scene, camera, getScreenPoint, onDone) {
  scene.attach(mesh)
  const start = mesh.position.clone()
  const startScale = mesh.scale.clone()
  const control = new THREE.Vector3()
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const duration = TIMING.fruitFlightMs / 1000

  tween({
    from: 0,
    to: 1,
    duration,
    ease: easings.inOutSine,
    onUpdate: (t) => {
      const end = targetWorldPos(camera, getScreenPoint())
      control.set((start.x + end.x) / 2, (start.y + end.y) / 2 + 1.6, (start.z + end.z) / 2)
      a.lerpVectors(start, control, t)
      b.lerpVectors(control, end, t)
      mesh.position.lerpVectors(a, b, t)

      const shrink = t > 0.7 ? 1 - ((t - 0.7) / 0.3) * (1 - 0.35) : 1
      mesh.scale.copy(startScale).multiplyScalar(shrink)
    },
    onComplete: () => {
      scene.remove(mesh)
      disposeTree(mesh, false)
      onDone?.()
    }
  })
}
