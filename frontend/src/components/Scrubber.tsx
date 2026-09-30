import { forwardRef, memo, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { Clip, KeyMoment, MatchMeta } from '../types'

export type ScrubberHandle = {
  /** Move the thumb without a parent re-render. Ignored while the user is dragging. */
  setPlayhead: (frame: number) => void
}

interface ScrubberProps {
  meta: MatchMeta
  clipStart: number | null
  clipEnd: number | null
  clips: Clip[]
  onSeek: (frame: number) => void
  onScrubStart: () => void
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 10)
  return `${m}:${s.toString().padStart(2, '0')}.${ms}`
}

const TimelineOverlay = memo(function TimelineOverlay({
  meta,
  clips,
  clipStart,
  clipEnd,
  onSeek,
}: {
  meta: MatchMeta
  clips: Clip[]
  clipStart: number | null
  clipEnd: number | null
  onSeek: (frame: number) => void
}) {
  const totalFrames = meta.frame_count
  const momentPosition = (frame: number) => (frame / totalFrames) * 100

  return (
    <>
      {clips.map((clip) => {
        const left = momentPosition(clip.start_frame)
        const width = momentPosition(clip.end_frame) - left
        return (
          <div
            key={clip.id}
            className="absolute top-3 h-2 rounded bg-accent/40"
            style={{ left: `${left}%`, width: `${width}%` }}
            title={clip.title}
          />
        )
      })}

      {clipStart !== null && clipEnd !== null && (
        <div
          className="absolute top-3 h-2 rounded bg-accent/70 border border-accent"
          style={{
            left: `${momentPosition(Math.min(clipStart, clipEnd))}%`,
            width: `${Math.abs(momentPosition(clipEnd) - momentPosition(clipStart))}%`,
          }}
        />
      )}

      {meta.key_moments.map((m: KeyMoment) => (
        <button
          key={`${m.type}-${m.frame}`}
          type="button"
          className={`absolute top-0 w-2 h-4 -translate-x-1/2 rounded-sm ${
            m.type === 'goal' ? 'bg-goal' : 'bg-shot'
          } hover:scale-125 transition-transform`}
          style={{ left: `${momentPosition(m.frame)}%` }}
          title={m.label}
          onClick={() => onSeek(m.frame)}
        />
      ))}
    </>
  )
})

export const Scrubber = memo(
  forwardRef<ScrubberHandle, ScrubberProps>(function Scrubber(
    { meta, clipStart, clipEnd, clips, onSeek, onScrubStart },
    ref,
  ) {
    const fps = meta.fps
    const totalFrames = meta.frame_count
    const duration = totalFrames / fps
    const lastFrame = Math.max(0, totalFrames - 1)
    const [playhead, setPlayhead] = useState(0)
    const dragging = useRef(false)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
      const endDrag = () => {
        dragging.current = false
      }
      window.addEventListener('pointerup', endDrag)
      window.addEventListener('pointercancel', endDrag)
      return () => {
        window.removeEventListener('pointerup', endDrag)
        window.removeEventListener('pointercancel', endDrag)
      }
    }, [])

    useImperativeHandle(ref, () => ({
      setPlayhead(frame: number) {
        if (dragging.current) return
        const next = Math.max(0, Math.min(lastFrame, Math.round(frame)))
        if (inputRef.current) inputRef.current.value = String(next)
        setPlayhead((prev) => (prev === next ? prev : next))
      },
    }))

    const shown = Math.max(0, Math.min(lastFrame, Math.round(playhead)))

    return (
      <div className="space-y-2">
        <div className="relative h-8">
          <TimelineOverlay
            meta={meta}
            clips={clips}
            clipStart={clipStart}
            clipEnd={clipEnd}
            onSeek={onSeek}
          />

          <input
            ref={inputRef}
            type="range"
            min={0}
            max={lastFrame}
            step={1}
            defaultValue={0}
            onPointerDown={() => {
              dragging.current = true
              onScrubStart()
            }}
            onPointerUp={() => {
              dragging.current = false
            }}
            onPointerCancel={() => {
              dragging.current = false
            }}
            onInput={(e) => {
              const frame = Number(e.currentTarget.value)
              setPlayhead(frame)
              onSeek(frame)
            }}
            className="absolute bottom-0 w-full h-2 appearance-none bg-panel-border rounded-full cursor-pointer touch-none
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer
              [&::-webkit-slider-thumb]:shadow-md"
            aria-label="Scrub through match"
          />
        </div>

        <div className="flex justify-between text-xs text-slate-400 font-mono">
          <span>{formatTime(shown / fps)}</span>
          <span>
            Frame {shown} / {lastFrame}
          </span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    )
  }),
)
