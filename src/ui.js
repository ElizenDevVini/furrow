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
    <div class="panel panel-wallet">
      <div class="wordmark">furrow</div>
      <div class="line"><span class="label">balance</span> <span class="balance-value">0.0500</span> eth</div>
      <div class="line"><span class="label">silo</span> <span class="silo-value">0.0000</span> eth</div>
      <p class="note">simulated. seeds buy simulated fractional stock at a reference rate. nothing here is real.</p>
      <button class="reset-btn" type="button">reset</button>
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

export function initHud({ tickers: tickerList, seeds: seedTable, api }) {
  tickers = tickerList
  seeds = seedTable

  const root = document.getElementById('hud')
  root.innerHTML = buildSkeleton()

  els = {
    balance: root.querySelector('.balance-value'),
    silo: root.querySelector('.silo-value'),
    total: root.querySelector('.total-value'),
    toast: root.querySelector('.toast'),
    tileLabel: root.querySelector('.tile-label'),
    resetBtn: root.querySelector('.reset-btn')
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
  }

  tickerColors = {}
  for (const t of tickers) tickerColors[t] = tickerColor(t)

  els.resetBtn.addEventListener('click', () => {
    api.reset()
    location.reload()
  })

  root.querySelectorAll('.panel').forEach((panel, i) => {
    setTimeout(() => panel.classList.add('in'), i * 60)
  })
}

export function selectTicker(ticker) {
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

export function countUpHoldings(ticker, fromShares, toShares, fromUsd, toUsd) {
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

export function updateTileLabel(hoveredIndex, tile, x, y) {
  if (hoveredIndex < 0) {
    els.tileLabel.style.display = 'none'
    return
  }

  let text
  if (!tile) {
    text = `plot ${hoveredIndex + 1} · empty`
  } else if (tile.stage === 3) {
    text = `${tile.ticker} · ready · ${tile.shares.toFixed(4)} sh`
  } else {
    text = `${tile.ticker} · ${Math.round(tile.progress * 100)}% · ${tile.shares.toFixed(4)} sh`
  }

  els.tileLabel.textContent = text
  els.tileLabel.style.display = 'block'
  els.tileLabel.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)`
}

export function toast(message) {
  els.toast.textContent = message
  els.toast.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), TOAST_HOLD_MS)
}
