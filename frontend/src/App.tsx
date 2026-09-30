import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchClips, fetchMeta } from './api'
import { ClipPanel } from './components/ClipPanel'
import { PitchCanvas, type PitchHandle } from './components/PitchCanvas'
import { PlaybackControls } from './components/PlaybackControls'
import { Scrubber, type ScrubberHandle } from './components/Scrubber'
import { usePlayback } from './hooks/usePlayback'
import type { Clip, MatchMeta } from './types'

export default function App() {
  const [meta, setMeta] = useState<MatchMeta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [clipStart, setClipStart] = useState<number | null>(null)
  const [clipEnd, setClipEnd] = useState<number | null>(null)
  const [clips, setClips] = useState<Clip[]>([])

  const canvasRef = useRef<PitchHandle>(null)
  const scrubberRef = useRef<ScrubberHandle>(null)
  const {
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
  } = usePlayback(meta, canvasRef, scrubberRef)

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
      })
      .catch((e) => setError(e.message))
  }, [loadClips])

  useEffect(() => {
    if (!meta) return
    const clipId = new URLSearchParams(window.location.search).get('clip')
    if (!clipId) return
    fetchClips().then((all) => {
      const clip = all.find((c) => c.id === clipId)
      if (!clip) return
      seek(clip.start_frame)
      setClipStart(clip.start_frame)
      setClipEnd(clip.end_frame)
    })
  }, [meta, seek])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.code === 'Space' && e.target instanceof HTMLButtonElement) return
      switch (e.code) {
        case 'Space':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowLeft':
          e.preventDefault()
          step(e.shiftKey ? -1 : -10)
          break
        case 'ArrowRight':
          e.preventDefault()
          step(e.shiftKey ? 1 : 10)
          break
        case 'KeyI':
          setClipStart(currentFrame())
          break
        case 'KeyO':
          setClipEnd(currentFrame())
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay, step, currentFrame])

  const onSetClipStart = useCallback(() => {
    setClipStart(currentFrame())
  }, [currentFrame])

  const onSetClipEnd = useCallback(() => {
    setClipEnd(currentFrame())
  }, [currentFrame])

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
          <PitchCanvas ref={canvasRef} meta={meta} />

          <Scrubber
            ref={scrubberRef}
            meta={meta}
            clipStart={clipStart}
            clipEnd={clipEnd}
            clips={clips}
            onSeek={seek}
            onScrubStart={pause}
          />

          <PlaybackControls
            isPlaying={isPlaying}
            speed={speed}
            showNames={showNames}
            showTrail={showTrail}
            onPlayPause={togglePlay}
            onSpeedChange={setSpeed}
            onStep={step}
            onToggleNames={toggleNames}
            onToggleTrail={toggleTrail}
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
          onSetClipStart={onSetClipStart}
          onSetClipEnd={onSetClipEnd}
          onClipsChange={loadClips}
          onSeek={seek}
        />
      </div>
    </div>
  )
}
