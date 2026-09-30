import type { Clip, MatchMeta, TrackingFrame } from './types'

const API = '/api'

export async function fetchMeta(): Promise<MatchMeta> {
  const res = await fetch(`${API}/meta`)
  if (!res.ok) throw new Error('Failed to load match metadata')
  return res.json()
}

export async function fetchFrame(frame: number): Promise<TrackingFrame> {
  const res = await fetch(`${API}/frames/${frame}`)
  if (!res.ok) throw new Error(`Failed to load frame ${frame}`)
  return res.json()
}

export async function fetchFramesBatch(start: number, end: number): Promise<TrackingFrame[]> {
  const res = await fetch(`${API}/frames/batch?start=${start}&end=${end}`)
  if (!res.ok) throw new Error('Failed to load frames batch')
  return res.json()
}

export async function fetchClips(): Promise<Clip[]> {
  const res = await fetch(`${API}/clips`)
  if (!res.ok) throw new Error('Failed to load clips')
  return res.json()
}

export async function createClip(data: {
  title: string
  start_frame: number
  end_frame: number
  tags?: string[]
  notes?: string
}): Promise<Clip> {
  const res = await fetch(`${API}/clips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Failed to create clip')
  }
  return res.json()
}

export async function deleteClip(id: string): Promise<void> {
  const res = await fetch(`${API}/clips/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete clip')
}

export function clipExportUrl(id: string, format: 'gif' | 'mp4'): string {
  return `${API}/clips/${id}/export/${format}`
}
