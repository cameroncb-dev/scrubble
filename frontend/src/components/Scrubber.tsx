import type { Clip, KeyMoment, MatchMeta } from '../types'

interface ScrubberProps {
  meta: MatchMeta
  currentFrame: number
  clipStart: number | null
  clipEnd: number | null
  clips: Clip[]
  onSeek: (frame: number) => void
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 10)
  return `${m}:${s.toString().padStart(2, '0')}.${ms}`
}

export function Scrubber({ meta, currentFrame, clipStart, clipEnd, clips, onSeek }: ScrubberProps) {
  const fps = meta.fps
  const totalFrames = meta.frame_count
  const duration = totalFrames / fps
  const currentTime = currentFrame / fps
  const progress = totalFrames > 0 ? (currentFrame / totalFrames) * 100 : 0

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pct = Number(e.target.value) / 100
    onSeek(Math.round(pct * (totalFrames - 1)))
  }

  const momentPosition = (frame: number) => (frame / totalFrames) * 100

  return (
    <div className="space-y-2">
      <div className="relative h-8">
        {/* Saved clip regions */}
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

        {/* Active clip selection */}
        {clipStart !== null && clipEnd !== null && (
          <div
            className="absolute top-3 h-2 rounded bg-accent/70 border border-accent"
            style={{
              left: `${momentPosition(Math.min(clipStart, clipEnd))}%`,
              width: `${Math.abs(momentPosition(clipEnd) - momentPosition(clipStart))}%`,
            }}
          />
        )}

        {/* Key moment markers */}
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

        {/* Scrub slider */}
        <input
          type="range"
          min={0}
          max={100}
          step={0.01}
          value={progress}
          onChange={handleChange}
          className="absolute bottom-0 w-full h-2 appearance-none bg-panel-border rounded-full cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:shadow-md"
          aria-label="Scrub through match"
        />
      </div>

      <div className="flex justify-between text-xs text-slate-400 font-mono">
        <span>{formatTime(currentTime)}</span>
        <span>Frame {currentFrame} / {totalFrames - 1}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  )
}
