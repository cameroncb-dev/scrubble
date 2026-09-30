import type { PlayerPosition, TrackingFrame } from '../types'

/** Linearly blend two tracking frames for smooth playback between frames. */
export function interpolateFrames(a: TrackingFrame, b: TrackingFrame, t: number): TrackingFrame {
  const blend = (v1: number | null, v2: number | null): number | null => {
    if (v1 === null || v2 === null) return v1 ?? v2
    return v1 + (v2 - v1) * t
  }

  const playerMap = new Map<number, PlayerPosition>()
  for (const p of a.player_data) {
    playerMap.set(p.player_id, p)
  }

  const interpolatedPlayers: PlayerPosition[] = []
  for (const pb of b.player_data) {
    const pa = playerMap.get(pb.player_id)
    if (pa) {
      interpolatedPlayers.push({
        player_id: pb.player_id,
        x: pa.x + (pb.x - pa.x) * t,
        y: pa.y + (pb.y - pa.y) * t,
        is_detected: pa.is_detected || pb.is_detected,
      })
    } else {
      interpolatedPlayers.push(pb)
    }
  }

  return {
    frame: a.frame,
    timestamp: a.timestamp,
    period: a.period,
    ball_data: {
      x: blend(a.ball_data.x, b.ball_data.x),
      y: blend(a.ball_data.y, b.ball_data.y),
      z: blend(a.ball_data.z ?? null, b.ball_data.z ?? null),
      is_detected: a.ball_data.is_detected || b.ball_data.is_detected,
    },
    possession: a.possession,
    player_data: interpolatedPlayers,
  }
}
