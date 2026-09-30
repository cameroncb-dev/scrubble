import type { PlayerPosition, TrackingFrame } from '../types'

const leftById = new Map<number, PlayerPosition>()
const seenIds = new Set<number>()
const ballScratch = { x: 0, y: 0 }

export type BallPoint = { x: number; y: number }

/**
 * Blend ball coordinates. A one-frame detection gap holds the last fix
 * instead of snapping to whichever side still has a number.
 * The returned object is reused; copy it if you need to keep it.
 */
export function blendBall(
  a: TrackingFrame['ball_data'],
  b: TrackingFrame['ball_data'],
  t: number,
  held: BallPoint | null,
): BallPoint | null {
  const aOk = a.x != null && a.y != null
  const bOk = b.x != null && b.y != null

  if (aOk && bOk) {
    ballScratch.x = a.x! + (b.x! - a.x!) * t
    ballScratch.y = a.y! + (b.y! - a.y!) * t
    return ballScratch
  }
  if (aOk) {
    ballScratch.x = a.x!
    ballScratch.y = a.y!
    return ballScratch
  }
  if (bOk && held) {
    ballScratch.x = held.x + (b.x! - held.x) * t
    ballScratch.y = held.y + (b.y! - held.y) * t
    return ballScratch
  }
  if (bOk) {
    ballScratch.x = b.x!
    ballScratch.y = b.y!
    return ballScratch
  }
  if (held) {
    ballScratch.x = held.x
    ballScratch.y = held.y
    return ballScratch
  }
  return null
}

/** Visit every player on either frame, holding position when one side is missing. */
export function forEachPlayer(
  a: TrackingFrame,
  b: TrackingFrame,
  t: number,
  visit: (id: number, x: number, y: number) => void,
): void {
  leftById.clear()
  for (const p of a.player_data) leftById.set(p.player_id, p)

  seenIds.clear()
  for (const pb of b.player_data) {
    seenIds.add(pb.player_id)
    const pa = leftById.get(pb.player_id)
    if (pa) visit(pb.player_id, pa.x + (pb.x - pa.x) * t, pa.y + (pb.y - pa.y) * t)
    else visit(pb.player_id, pb.x, pb.y)
  }
  for (const pa of a.player_data) {
    if (!seenIds.has(pa.player_id)) visit(pa.player_id, pa.x, pa.y)
  }
}

/** Linearly blend two tracking frames. Prefer the draw-path helpers during playback. */
export function interpolateFrames(a: TrackingFrame, b: TrackingFrame, t: number): TrackingFrame {
  const players: PlayerPosition[] = []
  forEachPlayer(a, b, t, (id, x, y) => {
    players.push({ player_id: id, x, y, is_detected: true })
  })

  const ball = blendBall(a.ball_data, b.ball_data, t, null)
  return {
    frame: a.frame,
    timestamp: a.timestamp,
    period: a.period,
    ball_data: {
      x: ball?.x ?? null,
      y: ball?.y ?? null,
      z: a.ball_data.z ?? b.ball_data.z ?? null,
      is_detected: a.ball_data.is_detected || b.ball_data.is_detected,
    },
    possession: a.possession,
    player_data: players,
  }
}
