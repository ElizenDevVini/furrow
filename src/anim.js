export const TIMING = { hoverLift: 0.08, hoverStiffness: 220, hoverDamping: 18 }

export const easings = {
  linear: (t) => t,
  outBack: (t) => {
    const c1 = 1.70158
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

const activeTweens = new Set()

export function tween({ from, to, duration, ease = easings.linear, onUpdate, onComplete }) {
  const handle = { elapsed: 0, cancelled: false }
  handle.cancel = () => {
    handle.cancelled = true
    activeTweens.delete(handle)
  }
  activeTweens.add(handle)
  handle.from = from
  handle.to = to
  handle.duration = duration
  handle.ease = ease
  handle.onUpdate = onUpdate
  handle.onComplete = onComplete
  return handle
}

export function updateTweens(dt) {
  for (const handle of activeTweens) {
    if (handle.cancelled) continue
    handle.elapsed += dt
    const t = Math.min(1, handle.elapsed / handle.duration)
    const eased = handle.ease(t)
    const value = handle.from + (handle.to - handle.from) * eased
    handle.onUpdate?.(value)
    if (t >= 1) {
      activeTweens.delete(handle)
      handle.onComplete?.()
    }
  }
}
