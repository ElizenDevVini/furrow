export const TIMING = {
  hoverLift: 0.08,
  hoverStiffness: 220,
  hoverDamping: 18,
  plantDropHeight: 2.5,
  gravity: 20,
  squashY: 0.6,
  squashXZ: 1.3,
  puffMs: 400,
  growPopMs: 500,
  shrinkOutMs: 150,
  leafStaggerMs: 40,
  harvestAnticipateMs: 120,
  fruitFlightMs: 700,
  cameraPunch: 0.02,
  tileKick: 0.06
}

export const easings = {
  linear: (t) => t,
  outBack: (t) => {
    const c1 = 2.6
    const c3 = c1 + 1
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
  },
  outExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2
}

export function spring(value, target, velocity, dt, stiffness, damping) {
  const force = stiffness * (target - value) - damping * velocity
  const nextVelocity = velocity + force * dt
  const nextValue = value + nextVelocity * dt
  return { value: nextValue, velocity: nextVelocity }
}

export function springVec(current, target, velocity, dt, stiffness, damping) {
  const sx = spring(current.x, target.x, velocity.x, dt, stiffness, damping)
  const sy = spring(current.y, target.y, velocity.y, dt, stiffness, damping)
  const sz = spring(current.z, target.z, velocity.z, dt, stiffness, damping)
  current.set(sx.value, sy.value, sz.value)
  velocity.set(sx.velocity, sy.velocity, sz.velocity)
}

const activeTweens = new Set()

// duration is in seconds. handle is thenable so sequences can `await tween(...)`.
export function tween({ from, to, duration, ease = easings.linear, onUpdate, onComplete }) {
  const handle = { elapsed: 0, cancelled: false }
  let resolvePromise
  const promise = new Promise((resolve) => {
    resolvePromise = resolve
  })
  handle.then = promise.then.bind(promise)
  handle.cancel = () => {
    if (handle.cancelled) return
    handle.cancelled = true
    activeTweens.delete(handle)
    resolvePromise()
  }

  if (duration <= 0) {
    onUpdate?.(to)
    onComplete?.()
    resolvePromise()
    return handle
  }

  Object.assign(handle, { from, to, duration, ease, onUpdate, onComplete, resolve: resolvePromise })
  activeTweens.add(handle)
  return handle
}

// ms, not seconds, to match TIMING's *Ms fields at call sites.
export function delay(ms) {
  return tween({ from: 0, to: 1, duration: ms / 1000 })
}

export function updateTweens(dt) {
  for (const handle of activeTweens) {
    handle.elapsed += dt
    const t = Math.min(1, handle.elapsed / handle.duration)
    const eased = handle.ease(t)
    handle.onUpdate?.(handle.from + (handle.to - handle.from) * eased)
    if (t >= 1) {
      activeTweens.delete(handle)
      handle.onComplete?.()
      handle.resolve()
    }
  }
}
