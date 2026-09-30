import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchClips, fetchFrame, fetchFramesBatch, fetchMeta } from './api'
import { ClipPanel } from './components/ClipPanel'
import { PitchCanvas } from './components/PitchCanvas'
import { PlaybackControls } from './components/PlaybackControls'
import { Scrubber } from './components/Scrubber'
import { interpolateFrames } from './lib/interpolate'
import type { Clip, MatchMeta, TrackingFrame } from './types'

export default function App() {
  const [meta, setMeta] = useState<MatchMeta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [displayFrame, setDisplayFrame] = useState<TrackingFrame | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [showNames, setShowNames] = useState(false)
  const [showTrail, setShowTrail] = useState(true)
  const [clipStart, setClipStart] = useState<number | null>(null)
  const [clipEnd, setClipEnd] = useState<number | null>(null)
  const [clips, setClips] = useState<Clip[]>([])
  const [ballTrail, setBallTrail] = useState<Array<{ x: number; y: number }>>([])

  const frameCache = useRef<Map<number, TrackingFrame>>(new Map())
  const playTimeRef = useRef(0)
  const lastTickRef = useRef(0)
  const rafRef = useRef(0)

  const loadClips = useCallback(async () => {
    try {
      const data = await fetchClips()
      setClips(data)
    } catch {
      /* clips optional on first load */
    }
  }, [])

  useEffect(() => {
    fetchMeta()
      .then((m) => {
        setMeta(m)
        loadClips()
        const params = new URLSearchParams(window.location.search)
        const clipId = params.get('clip')
        if (clipId) {
          fetchClips().then((all) => {
            const clip = all.find((c) => c.id === clipId)
            if (clip) {
              setCurrentFrame(clip.start_frame)
              setClipStart(clip.start_frame)
              setClipEnd(clip.end_frame)
            }
          })
        }
      })
      .catch((e) => setError(e.message))
  }, [loadClips])

  const getFrame = useCallback(async (frameNum: number): Promise<TrackingFrame | null> => {
    const cached = frameCache.current.get(frameNum)
    if (cached) return cached

    try {
      const frame = await fetchFrame(frameNum)
      frameCache.current.set(frameNum, frame)
      return frame
    } catch {
      return null
    }
  }, [])

  const preloadFrames = useCallback(async (center: number) => {
    if (!meta) return
    const start = Math.max(0, center - 30)
    const end = Math.min(meta.frame_count - 1, center + 30)
    try {
      const frames = await fetchFramesBatch(start, end)
      for (const f of frames) {
        frameCache.current.set(f.frame, f)
      }
    } catch {
      /* preload is best-effort */
    }
  }, [meta])

  const updateDisplay = useCallback(async (frameFloat: number) => {
    if (!meta) return
    const frameA = Math.floor(frameFloat)
    const frameB = Math.min(frameA + 1, meta.frame_count - 1)
    const t = frameFloat - frameA

    const [fa, fb] = await Promise.all([getFrame(frameA), getFrame(frameB)])
    if (!fa) return

    const interpolated = t > 0 && fb ? interpolateFrames(fa, fb, t) : fa
    setDisplayFrame(interpolated)
    setCurrentFrame(frameA)

    if (showTrail && interpolated.ball_data.x !== null && interpolated.ball_data.y !== null) {
      setBallTrail((prev) => {
        const next = [...prev, { x: interpolated.ball_data.x!, y: interpolated.ball_data.y! }]
        return next.slice(-12)
      })
    }
  }, [meta, getFrame, showTrail])

  useEffect(() => {
    if (!meta) return
    updateDisplay(currentFrame)
    preloadFrames(currentFrame)
  }, [currentFrame, meta, updateDisplay, preloadFrames])

  // Playback loop with requestAnimationFrame
  useEffect(() => {
    if (!isPlaying || !meta) return

    playTimeRef.current = currentFrame
    lastTickRef.current = performance.now()

    const tick = (now: number) => {
      const dt = (now - lastTickRef.current) / 1000
      lastTickRef.current = now
      playTimeRef.current += dt * speed * meta.fps

      if (playTimeRef.current >= meta.frame_count - 1) {
        playTimeRef.current = meta.frame_count - 1
        setIsPlaying(false)
      }

      updateDisplay(playTimeRef.current)
      if (isPlaying) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isPlaying, speed, meta, updateDisplay, currentFrame])

  const handleSeek = (frame: number) => {
    if (!meta) return
    const clamped = Math.max(0, Math.min(frame, meta.frame_count - 1))
    setCurrentFrame(clamped)
    playTimeRef.current = clamped
    setIsPlaying(false)
    setBallTrail([])
  }

  const handleStep = (delta: number) => {
    handleSeek(currentFrame + delta)
  }

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      switch (e.code) {
        case 'Space':
          e.preventDefault()
          setIsPlaying((p) => !p)
          break
        case 'ArrowLeft':
          handleStep(e.shiftKey ? -1 : -10)
          break
        case 'ArrowRight':
          handleStep(e.shiftKey ? 1 : 10)
          break
        case 'KeyI':
          setClipStart(currentFrame)
          break
        case 'KeyO':
          setClipEnd(currentFrame)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center space-y-4 max-w-md">
          <h1 className="text-2xl font-bold text-white">Match Not Ready</h1>
          <p className="text-slate-400">{error}</p>
          <p className="text-sm text-slate-500">
            Run <code className="bg-panel px-2 py-1 rounded">python backend/prepare_match.py 1886347</code> first.
          </p>
        </div>
      </div>
    )
  }

  if (!meta) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-400">Loading match data...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-white">Tracking Scrubber</h1>
        <p className="text-slate-400">
          {meta.home_team} {meta.home_score} – {meta.away_score} {meta.away_team}
          <span className="mx-2">·</span>
          {meta.stadium}
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          <PitchCanvas
            frame={displayFrame}
            meta={meta}
            ballTrail={showTrail ? ballTrail : []}
            showNames={showNames}
          />

          <Scrubber
            meta={meta}
            currentFrame={currentFrame}
            clipStart={clipStart}
            clipEnd={clipEnd}
            clips={clips}
            onSeek={handleSeek}
          />

          <PlaybackControls
            isPlaying={isPlaying}
            speed={speed}
            showNames={showNames}
            showTrail={showTrail}
            onPlayPause={() => setIsPlaying((p) => !p)}
            onSpeedChange={setSpeed}
            onStep={handleStep}
            onToggleNames={() => setShowNames((n) => !n)}
            onToggleTrail={() => setShowTrail((t) => !t)}
          />

          <p className="text-xs text-slate-500">
            Shortcuts: Space = play/pause · ←/→ = step 1s · Shift+←/→ = step 1 frame · I = set clip start · O = set clip end
          </p>
        </div>

        <ClipPanel
          meta={meta}
          clipStart={clipStart}
          clipEnd={clipEnd}
          clips={clips}
          onSetClipStart={() => setClipStart(currentFrame)}
          onSetClipEnd={() => setClipEnd(currentFrame)}
          onClipsChange={loadClips}
          onSeek={handleSeek}
        />
      </div>
    </div>
  )
}
