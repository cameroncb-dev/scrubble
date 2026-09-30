import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { PitchHandle, PitchSample } from '../components/PitchCanvas'
import type { ScrubberHandle } from '../components/Scrubber'
import { FrameBuffer } from '../lib/frameBuffer'
import type { BallPoint } from '../lib/interpolate'
import type { MatchMeta, TrackingFrame } from '../types'

const EMPTY_TRAIL: readonly BallPoint[] = []
const BATCH = 200

/**
 * Steady playback clock and canvas drawing, kept off React state.
 * The playhead only moves when both frames needed for interpolation are
 * already cached, so a slow fetch pauses time instead of skipping ahead.
 */
export function usePlayback(
  meta: MatchMeta | null,
  canvasRef: RefObject<PitchHandle | null>,
  scrubberRef: RefObject<ScrubberHandle | null>,
) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeedState] = useState(1)
  const [showNames, setShowNames] = useState(false)
  const [showTrail, setShowTrail] = useState(true)

  const playheadRef = useRef(0)
  const playingRef = useRef(false)
  const speedRef = useRef(1)
  const showNamesRef = useRef(false)
  const showTrailRef = useRef(true)
  const pendingSeek = useRef<number | null>(null)

  const seekImpl = useRef<(frame: number) => void>((frame) => {
    pendingSeek.current = frame
  })
  const stepImpl = useRef<(delta: number) => void>(() => {})
  const pauseImpl = useRef<() => void>(() => {})
  const toggleImpl = useRef<() => void>(() => {})

  const seek = useCallback((frame: number) => {
    pendingSeek.current = frame
    seekImpl.current(frame)
  }, [])
  const currentFrame = useCallback(() => Math.round(playheadRef.current), [])
  const step = useCallback((delta: number) => stepImpl.current(delta), [])
  const pause = useCallback(() => pauseImpl.current(), [])
  const togglePlay = useCallback(() => toggleImpl.current(), [])

  const setSpeed = useCallback((next: number) => {
    speedRef.current = next
    setSpeedState(next)
  }, [])

  const toggleNames = useCallback(() => {
    const next = !showNamesRef.current
    showNamesRef.current = next
    setShowNames(next)
  }, [])

  const toggleTrail = useCallback(() => {
    const next = !showTrailRef.current
    showTrailRef.current = next
    setShowTrail(next)
  }, [])

  useEffect(() => {
    if (!meta) return
    const buffer = new FrameBuffer(meta.frame_count)
    const lastIndex = Math.max(0, meta.frame_count - 1)
    const fps = meta.fps > 0 ? meta.fps : 10

    const trail: BallPoint[] = []
    const pool: BallPoint[] = []
    const heldScratch: BallPoint = { x: 0, y: 0 }
    const sample: PitchSample = {
      a: null,
      b: null,
      t: 0,
      trail: EMPTY_TRAIL,
      showNames: false,
      heldBall: null,
    }

    let raf = 0
    let lastNow = performance.now()
    let published = -1
    let showingEmpty = true
    let heldSample: { a: TrackingFrame; b: TrackingFrame; t: number } | null = null
    let heldSampleFrame = -1
    let drawToken = ''

    const fillTrail = (endFrame: number): readonly BallPoint[] => {
      trail.length = 0
      if (!showTrailRef.current) return EMPTY_TRAIL
      const start = Math.max(0, endFrame - 11)
      for (let i = start; i <= endFrame; i++) {
        const frame = buffer.get(i)
        const x = frame?.ball_data.x
        const y = frame?.ball_data.y
        if (x == null || y == null) continue
        let point = pool[trail.length]
        if (!point) {
          point = { x: 0, y: 0 }
          pool.push(point)
        }
        point.x = x
        point.y = y
        trail.push(point)
      }
      return trail
    }

    const heldBall = (frameA: number): BallPoint | null => {
      const stop = Math.max(0, frameA - 8)
      for (let i = frameA - 1; i >= stop; i--) {
        const frame = buffer.get(i)
        const x = frame?.ball_data.x
        const y = frame?.ball_data.y
        if (x == null || y == null) continue
        heldScratch.x = x
        heldScratch.y = y
        return heldScratch
      }
      return null
    }

    const resolve = (playhead: number): { a: TrackingFrame; b: TrackingFrame; t: number } | null => {
      const frameA = Math.min(lastIndex, Math.max(0, Math.floor(playhead)))
      const frameB = Math.min(lastIndex, frameA + 1)
      const t = frameA === frameB ? 0 : playhead - frameA
      const a = buffer.get(frameA)
      const b = buffer.get(frameB)
      if (a && b) return { a, b, t }
      if (a) return { a, b: a, t: 0 }
      for (let d = 1; d <= 5; d++) {
        const near = buffer.get(frameA - d)
        if (near) return { a: near, b: near, t: 0 }
      }
      return null
    }

    const framesReady = (frameFloat: number) => {
      const frameA = Math.min(lastIndex, Math.floor(frameFloat))
      const frameB = Math.min(lastIndex, frameA + 1)
      return buffer.has(frameA) && buffer.has(frameB)
    }

    const paint = (forcePublish: boolean) => {
      const playhead = playheadRef.current
      const frameNow = Math.floor(playhead)
      const fresh = resolve(playhead)
      const resolved =
        fresh ?? (heldSample && Math.abs(frameNow - heldSampleFrame) <= 8 ? heldSample : null)
      if (fresh) {
        heldSample = fresh
        heldSampleFrame = frameNow
      }
      const canvas = canvasRef.current
      const namesOn = showNamesRef.current
      const trail = resolved && showTrailRef.current ? fillTrail(resolved.a.frame) : EMPTY_TRAIL
      const token = resolved
        ? `${resolved.a.frame}:${resolved.b.frame}:${Math.round(resolved.t * 1000)}:${namesOn ? 1 : 0}:${trail.length}`
        : 'empty'
      const shouldDraw = token !== drawToken
      if (shouldDraw) drawToken = token
      if (resolved && shouldDraw) {
        sample.a = resolved.a
        sample.b = resolved.b
        sample.t = resolved.t
        sample.showNames = namesOn
        sample.heldBall = heldBall(resolved.a.frame)
        sample.trail = trail
        canvas?.draw(sample)
        showingEmpty = false
      } else if (!resolved && shouldDraw && (!showingEmpty || forcePublish)) {
        sample.a = null
        sample.b = null
        sample.trail = EMPTY_TRAIL
        sample.heldBall = null
        canvas?.draw(sample)
        showingEmpty = true
      }

      const key = Math.floor(playhead)
      if (forcePublish || key !== published) {
        published = key
        scrubberRef.current?.setPlayhead(playhead)
      }
    }

    const prefetchAround = (frame: number, priority: number, behind: number, ahead: number) => {
      buffer.protect(frame)
      buffer.ensure(
        Math.max(0, frame - behind),
        Math.min(lastIndex, frame + ahead),
        priority,
      )
    }

    const seekTo = (frame: number) => {
      const clamped = Math.max(0, Math.min(lastIndex, Math.round(frame)))
      playheadRef.current = clamped
      pendingSeek.current = null
      if (playingRef.current) {
        playingRef.current = false
        setIsPlaying(false)
      }
      prefetchAround(clamped, 1, 24, 179)
      paint(true)
    }

    seekImpl.current = seekTo
    stepImpl.current = (delta: number) => seekTo(Math.round(playheadRef.current) + delta)
    pauseImpl.current = () => {
      if (!playingRef.current) return
      playingRef.current = false
      setIsPlaying(false)
    }
    toggleImpl.current = () => {
      const next = !playingRef.current
      if (next && playheadRef.current >= lastIndex) playheadRef.current = 0
      playingRef.current = next
      setIsPlaying(next)
    }

    if (pendingSeek.current != null) {
      seekTo(pendingSeek.current)
    } else {
      const frame = Math.max(0, Math.min(lastIndex, Math.round(playheadRef.current)))
      prefetchAround(frame, 0, 12, BATCH - 1)
      paint(true)
    }

    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - lastNow) / 1000)
      lastNow = now

      if (playingRef.current && lastIndex > 0) {
        const candidate = playheadRef.current + dt * speedRef.current * fps
        if (candidate >= lastIndex) {
          playheadRef.current = lastIndex
          if (playingRef.current) {
            playingRef.current = false
            setIsPlaying(false)
          }
        } else if (framesReady(candidate)) {
          playheadRef.current = candidate
        }
      }

      const frame = Math.floor(playheadRef.current)
      const have = buffer.runway(frame)
      const want = playingRef.current
        ? Math.min(180, Math.ceil(70 * Math.max(1, speedRef.current)))
        : 24
      if (have < want) prefetchAround(frame, 0, 12, BATCH - 1)

      paint(false)
      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      buffer.dispose()
      seekImpl.current = (frame: number) => {
        pendingSeek.current = frame
      }
    }
  }, [meta, canvasRef, scrubberRef])

  return {
    isPlaying,
    speed,
    showNames,
    showTrail,
    currentFrame,
    seek,
    step,
    pause,
    togglePlay,
    setSpeed,
    toggleNames,
    toggleTrail,
  }
}
