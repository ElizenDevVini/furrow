import { tween, easings } from './anim.js'

const TOAST_HOLD_MS = 2200 + 320

let els = {}
let holdingsRows = new Map()
let trayRows = new Map()
let tickerColors = {}
let tickers = []
let seeds = {}
let selected = null
let toastTimer = null
let isTouch = false
let holdingsCollapsed = false
let onSeedTick = null
const tweening = new Set()

function formatDuration(ms) {
  if (ms < 60000) return `${Math.round(ms / 1000)} s`
  return `${Math.round(ms / 60000)} min`
}

function tickerColor(ticker) {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${ticker.toLowerCase()}`).trim()
}

function buildSkeleton() {
  const fast = location.search.includes('fast=1')

  const holdingsHtml = tickers
    .map(
      (t) => `
      <div class="holdings-row" data-ticker="${t}">
        <span class="h-ticker">${t}</span><span class="h-shares">0.0000</span><span class="h-usd">0.00</span>
      </div>`
    )
    .join('')

  const trayHtml = tickers
    .map((t, i) => {
      const seed = seeds[t]
      const time = formatDuration(fast ? seed.fastMs : seed.growMs)
      return `
      <div class="tray-row" data-ticker="${t}">
        <span class="t-key">${i + 1}</span><span class="t-ticker">${t}</span>
        <span class="t-price">${seed.price.toFixed(4)} eth</span><span class="t-time">${time}</span>
      </div>`
    })
    .join('')

  return `
    <div class="day-label"></div>
    <div class="panel panel-wallet">
      <div class="wordmark">furrow</div>
      <div class="line"><span class="label">balance</span> <span class="balance-value">0.0500</span> eth</div>
      <div class="line"><span class="label">silo</span> <span class="silo-value">0.0000</span> eth</div>
      <p class="note">simulated. seeds buy simulated fractional stock at a reference rate. nothing here is real.</p>
      <div class="wallet-controls">
        <button class="reset-btn text-btn" type="button">reset</button>
        <span class="control-sep">&middot;</span>
        <button class="sound-btn text-btn" type="button">sound on</button>
      </div>
    </div>
    <div class="panel panel-holdings">
      <div class="heading">holdings</div>
      ${holdingsHtml}
      <div class="rule"></div>
      <div class="holdings-row total-row">
        <span class="h-ticker">total</span><span class="h-usd total-value">0.00</span>
      </div>
    </div>
    <div class="toast"></div>
    <div class="panel panel-tray">
      ${trayHtml}
    </div>
    <div class="tile-label"></div>
  `
}

export function initHud({ tickers: tickerList, seeds: seedTable, api, touch, onToggleSound, onSeedTick: seedTick }) {
  tickers = tickerList
  seeds = seedTable
  isTouch = touch
  onSeedTick = seedTick

  const root = document.getElementById('hud')
  root.innerHTML = buildSkeleton()

  els = {
    balance: root.querySelector('.balance-value'),
    silo: root.querySelector('.silo-value'),
    total: root.querySelector('.total-value'),
    toast: root.querySelector('.toast'),
    tileLabel: root.querySelector('.tile-label'),
    dayLabel: root.querySelector('.day-label'),
    resetBtn: root.querySelector('.reset-btn'),
    soundBtn: root.querySelector('.sound-btn'),
    holdingsPanel: root.querySelector('.panel-holdings')
  }

  holdingsRows = new Map()
  for (const row of root.querySelectorAll('.holdings-row[data-ticker]')) {
    holdingsRows.set(row.dataset.ticker, {
      row,
      shares: row.querySelector('.h-shares'),
      usd: row.querySelector('.h-usd')
    })
  }

  trayRows = new Map()
  for (const row of root.querySelectorAll('.tray-row')) {
    const ticker = row.dataset.ticker
    trayRows.set(ticker, row)
    row.addEventListener('click', () => selectTicker(ticker))
    row.addEventListener('pointerenter', () => onSeedTick?.())
  }

  tickerColors = {}
  for (const t of tickers) tickerColors[t] = tickerColor(t)

  els.resetBtn.addEventListener('click', () => {
    api.reset()
    location.reload()
  })

  els.soundBtn.addEventListener('click', () => onToggleSound?.())

  root.querySelector('.total-row').addEventListener('click', () => {
    holdingsCollapsed = !holdingsCollapsed
    els.holdingsPanel.classList.toggle('collapsed', holdingsCollapsed)
  })

  // starts collapsed on narrow layouts, where the full row list would crowd
  // the wallet panel next to it; a tap on the total row expands it.
  if (matchMedia('(max-width: 700px)').matches) {
    holdingsCollapsed = true
    els.holdingsPanel.classList.add('collapsed')
  }
}

export function showHud() {
  const root = document.getElementById('hud')
  const targets = [...root.querySelectorAll('.panel'), els.dayLabel]
  targets.forEach((el, i) => {
    setTimeout(() => el.classList.add('in'), i * 60)
  })
}

export function setSoundLabel(muted) {
  els.soundBtn.textContent = muted ? 'sound off' : 'sound on'
}

export function updateDayLabel(day, phase) {
  els.dayLabel.textContent = `day ${day} · ${phase}`
}

export function selectTicker(ticker) {
  if (ticker !== selected) onSeedTick?.()
  selected = ticker
  for (const [t, row] of trayRows) {
    const isSelected = t === ticker
    row.classList.toggle('selected', isSelected)
    row.style.borderLeftColor = isSelected ? tickerColors[t] : 'transparent'
  }
}

export function getSelected() {
  return selected
}

export function renderWallet(snapshot) {
  els.balance.textContent = snapshot.eth.toFixed(4)
  els.silo.textContent = snapshot.silo.toFixed(4)
  for (const [ticker, row] of trayRows) {
    row.classList.toggle('unaffordable', snapshot.eth < seeds[ticker].price)
  }
}

export function renderHoldings(snapshot) {
  for (const [ticker, entry] of holdingsRows) {
    if (tweening.has(ticker)) continue
    entry.shares.textContent = snapshot.holdings[ticker].toFixed(4)
    entry.usd.textContent = (snapshot.holdings[ticker] * snapshot.prices[ticker]).toFixed(2)
  }
  // total mixes every row, so it holds at its pre-harvest value until the
  // last pending row finishes counting up, same as the row it belongs to.
  if (tweening.size === 0) els.total.textContent = snapshot.totalUsd.toFixed(2)
}

// called before api.harvest() mutates sim state, so the per-frame
// renderHoldings() repaint can't show the new shares before the fruit
// finishes flying there. countUpHoldings releases the hold when it finishes;
// releasePending covers the case where the harvest call itself fails.
export function holdPending(ticker) {
  tweening.add(ticker)
}

export function releasePending(ticker) {
  tweening.delete(ticker)
}

// the total mixes every row, so it tweens alongside the row's own shares/usd
// tweens rather than snapping the instant the row finishes -- otherwise it
// visibly lags a frame behind the count-up it belongs to.
export function countUpHoldings(ticker, fromShares, toShares, fromUsd, toUsd, fromTotal, toTotal) {
  const entry = holdingsRows.get(ticker)
  if (!entry) return

  entry.row.classList.add('flash')
  requestAnimationFrame(() => entry.row.classList.remove('flash'))

  tweening.add(ticker)

  tween({
    from: fromShares,
    to: toShares,
    duration: 0.6,
    ease: easings.outExpo,
    onUpdate: (v) => {
      entry.shares.textContent = v.toFixed(4)
    }
  })
  tween({
    from: fromUsd,
    to: toUsd,
    duration: 0.6,
    ease: easings.outExpo,
    onUpdate: (v) => {
      entry.usd.textContent = v.toFixed(2)
    }
  })
  tween({
    from: fromTotal,
    to: toTotal,
    duration: 0.6,
    ease: easings.outExpo,
    onUpdate: (v) => {
      els.total.textContent = v.toFixed(2)
    },
    onComplete: () => tweening.delete(ticker)
  })
}

export function holdingsAnchor(ticker) {
  const entry = holdingsRows.get(ticker)
  if (!entry) return { x: innerWidth - 100, y: 80 }
  const rect = entry.shares.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

export function updateTileLabel(index, tile, x, y) {
  if (index < 0) {
    els.tileLabel.style.display = 'none'
    return
  }

  let text
  if (!tile) {
    if (selected) text = isTouch ? `tap to plant ${selected}` : `e · plant ${selected}`
    else text = `plot ${index + 1} · empty`
  } else if (tile.stage === 3) {
    text = isTouch ? `tap to harvest ${tile.ticker}` : `e · harvest ${tile.ticker}`
  } else {
    text = `${tile.ticker} · ${Math.round(tile.progress * 100)}%`
  }

  els.tileLabel.textContent = text
  els.tileLabel.style.display = 'block'
  els.tileLabel.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)`
}

export function initStartScreen({ touch, onStart }) {
  const root = document.createElement('div')
  root.id = 'start-screen'
  const controls = touch
    ? 'tap a plot to walk there and work it &middot; drag to look'
    : 'wasd or click to walk &middot; e to plant and harvest &middot; 1 to 5 to pick a seed &middot; drag to look'

  root.innerHTML = `
    <div class="start-scrim"></div>
    <div class="start-panel">
      <div class="start-wordmark">furrow</div>
      <p class="start-tagline">a small farm that pays in simulated stock</p>
      <p class="start-controls">${controls}</p>
      <button class="start-btn" type="button">start</button>
    </div>
  `
  document.body.appendChild(root)

  let dismissed = false
  function dismiss() {
    if (dismissed) return
    dismissed = true
    onStart?.()
    root.classList.add('out')
    setTimeout(() => root.remove(), 550)
  }

  root.querySelector('.start-btn').addEventListener('click', dismiss)
  window.addEventListener('keydown', function firstKey() {
    window.removeEventListener('keydown', firstKey)
    dismiss()
  })
}

export function toast(message) {
  els.toast.textContent = message
  els.toast.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), TOAST_HOLD_MS)
}
