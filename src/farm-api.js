// the seam: wraps sim.js and owns the "now" clock, so a chain adapter can
// later stand in for this file without the scene or the HUD knowing.
import * as sim from './sim.js'

export function createSimApi() {
  sim.load()
  const listeners = new Set()

  function notify() {
    const snap = sim.snapshot(Date.now())
    for (const fn of listeners) fn(snap)
  }

  return {
    async plant(index, ticker) {
      const result = sim.plant(index, ticker, Date.now())
      notify()
      return result
    },
    async harvest(index) {
      const result = sim.harvest(index, Date.now())
      notify()
      return result
    },
    skip(index) {
      sim.skip(index, Date.now())
      notify()
    },
    discard(index) {
      sim.discard(index)
      notify()
    },
    reset() {
      sim.reset()
    },
    state() {
      return sim.snapshot(Date.now())
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    }
  }
}
