export interface PlayerInfo {
  id: number
  number: number | null
  name: string
  team: 'home' | 'away'
  position: string
}

export interface KeyMoment {
  frame: number
  type: 'goal' | 'shot'
  label: string
  time: string
}

export interface MatchMeta {
  match_id: string
  frame_count: number
  fps: number
  pitch_length: number
  pitch_width: number
  home_team: string
  away_team: string
  home_score: number
  away_score: number
  date: string
  stadium: string
  home_color: [number, number, number]
  away_color: [number, number, number]
  players: Record<string, PlayerInfo>
  key_moments: KeyMoment[]
}

export interface PlayerPosition {
  x: number
  y: number
  player_id: number
  is_detected: boolean
}

export interface TrackingFrame {
  frame: number
  timestamp: string | null
  period: number | null
  ball_data: {
    x: number | null
    y: number | null
    z?: number | null
    is_detected?: boolean | null
  }
  possession: {
    player_id: number | null
    group: string | null
  }
  player_data: PlayerPosition[]
}

export interface Clip {
  id: string
  title: string
  tags: string[]
  notes: string
  start_frame: number
  end_frame: number
  start_time: number
  end_time: number
  duration: number
  created_at: string
}
