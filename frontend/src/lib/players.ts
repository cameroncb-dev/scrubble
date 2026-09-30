import type { MatchMeta, PlayerInfo } from '../types'

const indexes = new WeakMap<MatchMeta, Map<number, PlayerInfo>>()

/** Tracking frames use the roster `id`, not the metadata dictionary key. */
export function playerIndex(meta: MatchMeta): Map<number, PlayerInfo> {
  const cached = indexes.get(meta)
  if (cached) return cached

  const map = new Map<number, PlayerInfo>()
  for (const [key, info] of Object.entries(meta.players)) {
    const keyNum = Number(key)
    if (!Number.isNaN(keyNum)) map.set(keyNum, info)
  }
  for (const info of Object.values(meta.players)) {
    map.set(info.id, info)
  }
  indexes.set(meta, map)
  return map
}

export function playerById(meta: MatchMeta, id: number): PlayerInfo | undefined {
  return playerIndex(meta).get(id)
}
