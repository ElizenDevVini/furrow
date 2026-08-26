// pure simulated economy: no three.js, no DOM except localStorage/location,
// so a chain adapter can later replace this file without touching the scene
// or the HUD. every price is a pure function of time, so every visitor sees
// the same tape.

export const TICKERS = ['TSLA', 'AAPL', 'NVDA', 'MSFT', 'AMZN']

export const SEEDS = {
  TSLA: { price: 0.002, growMs: 6 * 60000, fastMs: 20000 },
  AAPL: { price: 0.0035, growMs: 10 * 60000, fastMs: 30000 },
  NVDA: { price: 0.005, growMs: 15 * 60000, fastMs: 40000 },
  MSFT: { price: 0.003, growMs: 8 * 60000, fastMs: 25000 },
  AMZN: { price: 0.004, growMs: 12 * 60000, fastMs: 35000 }
}

const START_USD = { TSLA: 378.93, AAPL: 327.74, NVDA: 207.29, MSFT: 397.75, AMZN: 247.55 }
const ETH_START_USD = 3400
const VOL = 0.018
const ETH_VOL = 0.03

const WORLD_SEED = 20260826
const EPOCH = Date.UTC(2026, 7, 26, 0, 0, 0)
const DAY_MS = 86400000
const MINUTE_MS = 60000

const STORAGE_KEY = 'furrow/v1'
const ALLOWANCE_PER_HOUR = 0.01
const ALLOWANCE_CAP = 0.05

function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seedFor(key, index) {
  let h = (WORLD_SEED ^ Math.imul(index, 2654435761)) >>> 0
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 2246822519) >>> 0
  return h >>> 0
}

// Box-Muller: turns two uniform draws from the seeded PRNG into one normal
// draw, so daily returns look like returns instead of a sawtooth.
function normalDraw(key, dayIndex) {
  const rand = mulberry32(seedFor(key, dayIndex))
  const u1 = Math.max(rand(), 1e-9)
  const u2 = rand()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

function walkPrice(key, startValue, vol, now) {
  const dayIndex = Math.floor((now - EPOCH) / DAY_MS)
  let p = startValue
  for (let d = 0; d <= dayIndex; d++) {
    p *= 1 + normalDraw(key, d) * vol
  }
  const minuteIndex = Math.floor(now / MINUTE_MS)
  const wiggle = (mulberry32(seedFor(key, minuteIndex) ^ 0x9e3779b9)() - 0.5) * 0.006
  return Math.max(p * (1 + wiggle), 0.01)
}

export function price(ticker, now) {
  return walkPrice(ticker, START_USD[ticker], VOL, now)
}

export function ethUsd(now) {
  return walkPrice('ETH', ETH_START_USD, ETH_VOL, now)
}

function clamp01(v) {
  return Math.min(1, Math.max(0, v))
}

function defaultState() {
  return {
    eth: 0.05,
    tiles: new Array(25).fill(null),
    holdings: Object.fromEntries(TICKERS.map((t) => [t, 0])),
    silo: 0,
    lastAccrual: Date.now()
  }
}

let state = null

function accrue(now) {
  const hours = (now - state.lastAccrual) / 3600000
  if (hours <= 0) return
  state.eth = Math.min(ALLOWANCE_CAP, state.eth + hours * ALLOWANCE_PER_HOUR)
  state.lastAccrual = now
}

export function load() {
  if (location.search.includes('reset=1')) localStorage.removeItem(STORAGE_KEY)
  const raw = localStorage.getItem(STORAGE_KEY)
  state = raw ? JSON.parse(raw) : defaultState()
  accrue(Date.now())
  save()
  return state
}

export function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function reset() {
  localStorage.removeItem(STORAGE_KEY)
}

export function progress(index, now) {
  const tile = state.tiles[index]
  if (!tile) return 0
  return clamp01((now - tile.plantedAt) / (tile.readyAt - tile.plantedAt))
}

export function stage(index, now) {
  const tile = state.tiles[index]
  if (!tile) return -1
  const frac = progress(index, now)
  if (frac >= 1) return 3
  if (frac >= 0.55) return 2
  if (frac >= 0.25) return 1
  return 0
}

export function plant(index, ticker, now) {
  accrue(now)
  if (state.tiles[index]) throw new Error('plot taken')
  const seed = SEEDS[ticker]
  if (state.eth < seed.price) throw new Error('not enough eth')

  state.eth -= seed.price
  state.silo += seed.price

  // shares are fixed at plant time on purpose: this mirrors what the future
  // on-chain hook does, swapping seed eth to stock immediately.
  const shares = (seed.price * ethUsd(now)) / price(ticker, now)
  const fast = location.search.includes('fast=1')
  const duration = fast ? seed.fastMs : seed.growMs
  state.tiles[index] = { ticker, plantedAt: now, readyAt: now + duration, shares }
  save()
  return { ticker, shares }
}

export function harvest(index, now) {
  const tile = state.tiles[index]
  if (!tile) throw new Error('nothing to harvest')
  if (stage(index, now) !== 3) throw new Error('not ready')

  state.holdings[tile.ticker] += tile.shares
  state.tiles[index] = null
  save()
  return { ticker: tile.ticker, shares: tile.shares }
}

export function skip(index, now) {
  const tile = state.tiles[index]
  if (!tile) return
  const current = stage(index, now)
  if (current >= 3) return

  const thresholds = [0.25, 0.55, 1]
  const targetFrac = thresholds[current]
  const duration = tile.readyAt - tile.plantedAt
  const newPlantedAt = now - targetFrac * duration
  tile.plantedAt = newPlantedAt
  tile.readyAt = newPlantedAt + duration
  save()
}

export function discard(index) {
  state.tiles[index] = null
  save()
}

export function snapshot(now) {
  accrue(now)
  const prices = {}
  for (const ticker of TICKERS) prices[ticker] = price(ticker, now)

  let totalUsd = 0
  for (const ticker of TICKERS) totalUsd += state.holdings[ticker] * prices[ticker]

  const tiles = state.tiles.map((tile, i) => {
    if (!tile) return null
    return { ...tile, stage: stage(i, now), progress: progress(i, now) }
  })

  return {
    eth: state.eth,
    silo: state.silo,
    holdings: { ...state.holdings },
    tiles,
    prices,
    ethUsd: ethUsd(now),
    totalUsd
  }
}
