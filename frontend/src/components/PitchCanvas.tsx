import { forwardRef, memo, useEffect, useImperativeHandle, useRef } from 'react'
import { blendBall, forEachPlayer, type BallPoint } from '../lib/interpolate'
import { playerById } from '../lib/players'
import { describePossession } from '../lib/possession'
import { teamKits } from '../lib/teamColors'
import type { MatchMeta, TrackingFrame } from '../types'

export type PitchSample = {
  a: TrackingFrame | null
  b: TrackingFrame | null
  t: number
  trail: ReadonlyArray<BallPoint>
  showNames: boolean
  heldBall: BallPoint | null
}

export type PitchHandle = {
  draw: (sample: PitchSample) => void
}

const WIDTH = 1050
const HEIGHT = 680
const MARGIN = 20

type PitchCanvasProps = {
  meta: MatchMeta
}

function drawPitch(
  ctx: CanvasRenderingContext2D,
  meta: MatchMeta,
  w: number,
  h: number,
): void {
  const pitchW = meta.pitch_length
  const pitchH = meta.pitch_width

  const toX = (x: number) => MARGIN + ((x + pitchW / 2) / pitchW) * (w - 2 * MARGIN)
  const toY = (y: number) => MARGIN + ((pitchH / 2 - y) / pitchH) * (h - 2 * MARGIN)

  ctx.fillStyle = '#1a5c2e'
  ctx.fillRect(0, 0, w, h)

  const tlX = toX(-pitchW / 2)
  const tlY = toY(pitchH / 2)
  const brX = toX(pitchW / 2)
  const brY = toY(-pitchH / 2)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  ctx.strokeRect(tlX, tlY, brX - tlX, brY - tlY)

  ctx.beginPath()
  ctx.moveTo(toX(0), toY(pitchH / 2))
  ctx.lineTo(toX(0), toY(-pitchH / 2))
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(toX(0), toY(0), 50, 0, Math.PI * 2)
  ctx.stroke()

  const boxW = pitchW * 0.16
  const boxH = pitchH * 0.6
  for (const side of [-1, 1]) {
    const bx = (side * pitchW) / 2
    const c1x = toX(bx - side * boxW)
    const c1y = toY(boxH / 2)
    const c2x = toX(bx)
    const c2y = toY(-boxH / 2)
    ctx.strokeRect(c1x, c1y, c2x - c1x, c2y - c1y)
  }
}

export const PitchCanvas = memo(
  forwardRef<PitchHandle, PitchCanvasProps>(function PitchCanvas({ meta }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
    const pitchRef = useRef<HTMLCanvasElement | null>(null)
    const pitchKeyRef = useRef('')
    const nameWidths = useRef(new Map<number, number>())
    const metaRef = useRef(meta)
    useEffect(() => {
      metaRef.current = meta
    }, [meta])

    const context = () => {
      if (ctxRef.current) return ctxRef.current
      const canvas = canvasRef.current
      if (!canvas) return null
      ctxRef.current =
        canvas.getContext('2d', { alpha: false, desynchronized: true }) ?? canvas.getContext('2d')
      return ctxRef.current
    }

    const staticPitch = () => {
      const current = metaRef.current
      const key = `${current.pitch_length}x${current.pitch_width}`
      if (pitchRef.current && pitchKeyRef.current === key) return pitchRef.current
      const offscreen = document.createElement('canvas')
      offscreen.width = WIDTH
      offscreen.height = HEIGHT
      const off = offscreen.getContext('2d')
      if (!off) return null
      drawPitch(off, current, WIDTH, HEIGHT)
      pitchRef.current = offscreen
      pitchKeyRef.current = key
      nameWidths.current.clear()
      return offscreen
    }

    useImperativeHandle(ref, () => ({
      draw(sample: PitchSample) {
        const ctx = context()
        const pitch = staticPitch()
        if (!ctx || !pitch) return

        ctx.drawImage(pitch, 0, 0)
        if (!sample.a || !sample.b) return

        const current = metaRef.current
        const pitchW = current.pitch_length
        const pitchH = current.pitch_width
        const scaleX = (WIDTH - 2 * MARGIN) / pitchW
        const scaleY = (HEIGHT - 2 * MARGIN) / pitchH
        const toX = (x: number) => MARGIN + (x + pitchW / 2) * scaleX
        const toY = (y: number) => MARGIN + (pitchH / 2 - y) * scaleY

        const trail = sample.trail
        for (let i = 0; i < trail.length; i++) {
          const alpha = 0.2 + 0.6 * ((i + 1) / trail.length)
          ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`
          ctx.beginPath()
          ctx.arc(toX(trail[i].x), toY(trail[i].y), 4, 0, Math.PI * 2)
          ctx.fill()
        }

        const kits = teamKits(current.home_color, current.away_color)
        const possession = describePossession(
          current,
          sample.t >= 0.5 ? sample.b : sample.a,
        )
        ctx.font = 'bold 11px system-ui'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        forEachPlayer(sample.a, sample.b, sample.t, (id, x, y) => {
          const info = playerById(current, id)
          const away = info?.team === 'away'
          const px = toX(x)
          const py = toY(y)
          ctx.fillStyle = away ? kits.awayCss : kits.homeCss
          ctx.strokeStyle = away ? kits.awayInk : kits.homeInk
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(px, py, 12, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()

          if (possession.playerId === id) {
            ctx.strokeStyle = '#67e8f9'
            ctx.lineWidth = 2.5
            ctx.beginPath()
            ctx.arc(px, py, 16, 0, Math.PI * 2)
            ctx.stroke()
          }

          if (info?.number) {
            ctx.fillStyle = away ? kits.awayInk : kits.homeInk
            ctx.fillText(String(info.number), px, py)
          }

          if (sample.showNames && info?.name) {
            ctx.font = '10px system-ui'
            let textW = nameWidths.current.get(id)
            if (textW == null) {
              textW = ctx.measureText(info.name).width + 8
              nameWidths.current.set(id, textW)
            }
            ctx.fillStyle = 'rgba(0,0,0,0.7)'
            ctx.fillRect(px - textW / 2, py + 14, textW, 14)
            ctx.fillStyle = '#ffffff'
            ctx.fillText(info.name, px, py + 21)
            ctx.font = 'bold 11px system-ui'
          }
        })

        const ball = blendBall(sample.a.ball_data, sample.b.ball_data, sample.t, sample.heldBall)
        if (ball) {
          ctx.fillStyle = '#ffffff'
          ctx.strokeStyle = '#000000'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.arc(toX(ball.x), toY(ball.y), 6, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
        }
      },
    }))

    return (
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        className="w-full rounded-lg border border-panel-border bg-pitch"
        aria-label="Soccer pitch tracking visualization"
      />
    )
  }),
)
