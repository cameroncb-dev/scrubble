import { playerById } from './players'
import type { MatchMeta, PlayerInfo, TrackingFrame } from '../types'

/** Explicit possession in the file is usually inside ~2m. Past this, call it loose. */
const LOOSE_METERS = 3.5
/** When only the team is tagged, name a teammate who is still this close to the ball. */
const TEAM_NAMED_METERS = 6.5

export type PossessionView = {
  key: string
  team: 'home' | 'away' | null
  playerId: number | null
  text: string
}

function teamFromGroup(group: string | null | undefined): 'home' | 'away' | null {
  if (!group) return null
  const value = group.toLowerCase()
  if (value.includes('home')) return 'home'
  if (value.includes('away')) return 'away'
  return null
}

function teamName(meta: MatchMeta, team: 'home' | 'away' | null): string {
  if (team === 'home') return meta.home_team
  if (team === 'away') return meta.away_team
  return 'Unknown team'
}

function nearest(
  meta: MatchMeta,
  frame: TrackingFrame,
  x: number,
  y: number,
  team: 'home' | 'away' | null,
): { dist: number; info: PlayerInfo } | null {
  let best: { dist: number; info: PlayerInfo } | null = null
  for (const player of frame.player_data) {
    const info = playerById(meta, player.player_id)
    if (!info) continue
    if (team && info.team !== team) continue
    const dist = Math.hypot(player.x - x, player.y - y)
    if (!best || dist < best.dist) best = { dist, info }
  }
  return best
}

export function describePossession(meta: MatchMeta, frame: TrackingFrame | null): PossessionView {
  if (!frame) {
    return { key: 'wait', team: null, playerId: null, text: 'Waiting for tracking…' }
  }

  const ballX = frame.ball_data.x
  const ballY = frame.ball_data.y
  const hasBall = ballX != null && ballY != null
  const possession = frame.possession
  const groupTeam = teamFromGroup(possession?.group)
  const playerId = possession?.player_id ?? null

  if (playerId != null) {
    const info = playerById(meta, playerId)
    const team = info?.team ?? groupTeam
    const name = info?.name ?? `Player ${playerId}`
    return {
      key: `id:${playerId}`,
      team,
      playerId,
      text: `${teamName(meta, team)} · ${name}`,
    }
  }

  if (groupTeam) {
    const teamLabel = teamName(meta, groupTeam)
    if (hasBall) {
      const near = nearest(meta, frame, ballX, ballY, groupTeam)
      if (near && near.dist <= TEAM_NAMED_METERS) {
        return {
          key: `team:${groupTeam}:${near.info.id}`,
          team: groupTeam,
          playerId: near.info.id,
          text: `${teamLabel} · ${near.info.name}`,
        }
      }
    }
    return {
      key: `team:${groupTeam}`,
      team: groupTeam,
      playerId: null,
      text: `${teamLabel} in possession`,
    }
  }

  if (!hasBall) {
    return { key: 'noball', team: null, playerId: null, text: 'Loose ball' }
  }

  const near = nearest(meta, frame, ballX, ballY, null)
  if (near && near.dist <= LOOSE_METERS) {
    return {
      key: `near:${near.info.id}`,
      team: near.info.team,
      playerId: near.info.id,
      text: `${teamName(meta, near.info.team)} · ${near.info.name}`,
    }
  }

  return { key: 'loose', team: null, playerId: null, text: 'Loose ball' }
}
