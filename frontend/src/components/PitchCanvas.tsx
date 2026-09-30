import { useEffect, useRef } from 'react'
import type { MatchMeta, TrackingFrame } from '../types'

interface PitchCanvasProps {
  frame: TrackingFrame | null
  meta: MatchMeta
  ballTrail: Array<{ x: number; y: number }>
  showNames: boolean
}

export function PitchCanvas({ frame, meta, ballTrail, showNames }: PitchCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !frame) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = canvas.width
    const h = canvas.height
    const pitchW = meta.pitch_length
    const pitchH = meta.pitch_width
    const margin = 20

    const toCanvas = (x: number, y: number) => ({
      px: margin + ((x + pitchW / 2) / pitchW) * (w - 2 * margin),
      py: margin + ((pitchH / 2 - y) / pitchH) * (h - 2 * margin),
    })

    // Pitch background
    ctx.fillStyle = '#1a5c2e'
    ctx.fillRect(0, 0, w, h)

    // Pitch outline
    const tl = toCanvas(-pitchW / 2, pitchH / 2)
    const br = toCanvas(pitchW / 2, -pitchH / 2)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.strokeRect(tl.px, tl.py, br.px - tl.px, br.py - tl.py)

    // Center line
    const midTop = toCanvas(0, pitchH / 2)
    const midBot = toCanvas(0, -pitchH / 2)
    ctx.beginPath()
    ctx.moveTo(midTop.px, midTop.py)
    ctx.lineTo(midBot.px, midBot.py)
    ctx.stroke()

    // Center circle
    const center = toCanvas(0, 0)
    ctx.beginPath()
    ctx.arc(center.px, center.py, 50, 0, Math.PI * 2)
    ctx.stroke()

    // Penalty boxes
    const boxW = pitchW * 0.16
    const boxH = pitchH * 0.6
    for (const side of [-1, 1]) {
      const bx = side * pitchW / 2
      const c1 = toCanvas(bx - side * boxW, boxH / 2)
      const c2 = toCanvas(bx, -boxH / 2)
      ctx.strokeRect(c1.px, c1.py, c2.px - c1.px, c2.py - c1.py)
    }

    // Ball trail
    for (let i = 0; i < ballTrail.length; i++) {
      const { px, py } = toCanvas(ballTrail[i].x, ballTrail[i].y)
      const alpha = 0.2 + 0.6 * (i / ballTrail.length)
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`
      ctx.beginPath()
      ctx.arc(px, py, 4, 0, Math.PI * 2)
      ctx.fill()
    }

    // Players
    for (const p of frame.player_data) {
      const info = meta.players[String(p.player_id)]
      const team = info?.team ?? 'home'
      const color = team === 'home' ? meta.home_color : meta.away_color
      const { px, py } = toCanvas(p.x, p.y)

      ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(px, py, 12, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()

      if (info?.number) {
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 11px system-ui'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(info.number), px, py)
      }

      if (showNames && info?.name) {
        ctx.fillStyle = 'rgba(0,0,0,0.7)'
        ctx.font = '10px system-ui'
        const textW = ctx.measureText(info.name).width + 8
        ctx.fillRect(px - textW / 2, py + 14, textW, 14)
        ctx.fillStyle = '#ffffff'
        ctx.fillText(info.name, px, py + 21)
      }
    }

    // Ball
    const ball = frame.ball_data
    if (ball.x !== null && ball.y !== null) {
      const { px, py } = toCanvas(ball.x, ball.y)
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = '#000000'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(px, py, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
  }, [frame, meta, ballTrail, showNames])

  return (
    <canvas
      ref={canvasRef}
      width={1050}
      height={680}
      className="w-full rounded-lg border border-panel-border bg-pitch"
      aria-label="Soccer pitch tracking visualization"
    />
  )
}
