// src/pages/games/emberdelve/meta.js
// The Chandlery: what carries over between runs. Every run, however short,
// pays out Wax; Wax buys permanent upgrades that apply from the next delve.
// It is kept on this device (localStorage), like the hub's other per-device
// game settings, so a cleared browser starts the Chandlery afresh.

import { BOONS, boonAvailable } from './engine.js'

const KEY = 'ed-meta'

export const META = [
  { key: 'heart', name: 'Thicker Wax', text: '+1 starting heart', icon: '❤️', costs: [40, 90, 160] },
  { key: 'damage', name: 'Brighter Flame', text: '+8% damage', icon: '🔥', costs: [30, 60, 100, 150, 220] },
  { key: 'rate', name: 'Steady Hands', text: '+6% fire rate', icon: '⚡', costs: [30, 60, 100, 150, 220] },
  { key: 'speed', name: 'Nimble Base', text: '+5% move speed', icon: '👟', costs: [30, 70, 120] },
  { key: 'dash', name: 'Swift Step', text: 'Dash recharges 10% faster', icon: '💨', costs: [30, 70, 120] },
  { key: 'purse', name: 'Ember Purse', text: 'Start with 15 more embers', icon: '👛', costs: [30, 70, 120] },
  { key: 'reroll', name: 'Spare Wick', text: '+1 reroll at the start of a run', icon: '🎲', costs: [60, 140] },
  { key: 'haggle', name: 'Haggler', text: 'The Tallow Trader charges 10% less', icon: '🤝', costs: [80, 160] },
  { key: 'gift', name: 'Head Start', text: 'Begin with a free boon (rare at level 2)', icon: '🎁', costs: [120, 260] },
  { key: 'last', name: 'Last Light', text: 'Once a run, cling on with 1 heart instead of going out', icon: '🌟', costs: [300] },
]

export function loadMeta() {
  try {
    const m = JSON.parse(localStorage.getItem(KEY))
    if (m && typeof m.wax === 'number') return { wax: m.wax, levels: m.levels ?? {}, best: m.best ?? 0, runs: m.runs ?? 0 }
  } catch {
    // Unreadable or blocked storage: start a fresh Chandlery.
  }
  return { wax: 0, levels: {}, best: 0, runs: 0 }
}

export function saveMeta(meta) {
  try {
    localStorage.setItem(KEY, JSON.stringify(meta))
  } catch {
    // Not saved; the upgrades still apply for this visit.
  }
}

export function nextCost(meta, key) {
  const up = META.find((u) => u.key === key)
  const lvl = meta.levels[key] || 0
  return lvl < up.costs.length ? up.costs[lvl] : null
}

export function buyMeta(meta, key) {
  const cost = nextCost(meta, key)
  if (cost == null || meta.wax < cost) return meta
  return { ...meta, wax: meta.wax - cost, levels: { ...meta.levels, [key]: (meta.levels[key] || 0) + 1 } }
}

// Wax for a finished run: depth counts most, bosses pay well, leftover
// embers melt down at three to one.
export function waxFor(game) {
  return game.depth * 4 + game.bossKills * 25 + Math.floor(game.embers / 3) + Math.floor(game.kills / 5)
}

export function applyMeta(game, levels) {
  if (game.metaApplied) return
  game.metaApplied = true
  const l = (k) => levels[k] || 0
  const p = game.player
  p.maxHp += l('heart')
  p.hp = p.maxHp
  p.damage *= 1 + 0.08 * l('damage')
  p.fireDelay /= 1 + 0.06 * l('rate')
  p.speed *= 1 + 0.05 * l('speed')
  p.dashCd *= 1 - 0.1 * l('dash')
  game.embers += 15 * l('purse')
  game.rerolls += l('reroll')
  game.priceMult = 1 - 0.1 * l('haggle')
  p.lastLight = l('last')
  if (l('gift')) {
    const tier = l('gift') >= 2 ? 'rare' : 'common'
    const pool = Object.keys(BOONS).filter((k) => BOONS[k].tier === tier && boonAvailable(game, k))
    const key = pool[Math.floor(game.rand() * pool.length)]
    if (key) {
      BOONS[key].apply(p)
      p.taken[key] = (p.taken[key] || 0) + 1
      game.gift = key
    }
  }
}
