import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { describePossession, type PossessionView } from '../lib/possession'
import { teamKits } from '../lib/teamColors'
import type { MatchMeta, TrackingFrame } from '../types'

export type PossessionHandle = {
  setFrame: (frame: TrackingFrame | null) => void
}

function Swatch({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-3.5 w-3.5 rounded-full border border-black/40"
      style={{ backgroundColor: color }}
      aria-hidden
    />
  )
}

export const MatchStatus = forwardRef<PossessionHandle, { meta: MatchMeta }>(function MatchStatus(
  { meta },
  ref,
) {
  const kits = teamKits(meta.home_color, meta.away_color)
  const [view, setView] = useState<PossessionView>({
    key: 'wait',
    team: null,
    playerId: null,
    text: 'Waiting for tracking…',
  })
  const keyRef = useRef(view.key)

  useImperativeHandle(ref, () => ({
    setFrame(frame: TrackingFrame | null) {
      const next = describePossession(meta, frame)
      if (next.key === keyRef.current) return
      keyRef.current = next.key
      setView(next)
    },
  }), [meta])

  const teamColor =
    view.team === 'home' ? kits.homeCss : view.team === 'away' ? kits.awayCss : null

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-panel-border bg-panel px-3 py-2">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-slate-500">Possession</p>
        <p className="flex items-center gap-2 text-base font-semibold text-white">
          {teamColor && <Swatch color={teamColor} />}
          <span>{view.text}</span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm text-slate-200" aria-label="Team colors">
        <span className="flex items-center gap-2">
          <Swatch color={kits.homeCss} />
          {meta.home_team}
        </span>
        <span className="flex items-center gap-2">
          <Swatch color={kits.awayCss} />
          {meta.away_team}
        </span>
      </div>
    </div>
  )
})
