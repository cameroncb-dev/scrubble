import { Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { Button } from './ui/button'

interface PlaybackControlsProps {
  isPlaying: boolean
  speed: number
  showNames: boolean
  showTrail: boolean
  onPlayPause: () => void
  onSpeedChange: (speed: number) => void
  onStep: (delta: number) => void
  onToggleNames: () => void
  onToggleTrail: () => void
}

const SPEEDS = [0.5, 1, 1.5, 2]

export function PlaybackControls({
  isPlaying,
  speed,
  showNames,
  showTrail,
  onPlayPause,
  onSpeedChange,
  onStep,
  onToggleNames,
  onToggleTrail,
}: PlaybackControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" onClick={() => onStep(-10)} title="Back 1 second (←)">
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button variant="default" size="icon" onClick={onPlayPause} title="Play/Pause (Space)">
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button variant="outline" size="icon" onClick={() => onStep(10)} title="Forward 1 second (→)">
          <SkipForward className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-1">
        <span className="text-xs text-slate-400 mr-1">Speed:</span>
        {SPEEDS.map((s) => (
          <Button
            key={s}
            variant={speed === s ? 'default' : 'outline'}
            size="sm"
            onClick={() => onSpeedChange(s)}
          >
            {s}x
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <Button variant={showNames ? 'default' : 'outline'} size="sm" onClick={onToggleNames}>
          Player Names
        </Button>
        <Button variant={showTrail ? 'default' : 'outline'} size="sm" onClick={onToggleTrail}>
          Ball Trail
        </Button>
      </div>
    </div>
  )
}
