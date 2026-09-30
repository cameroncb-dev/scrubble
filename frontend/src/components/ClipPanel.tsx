import { Download, Link2, Trash2 } from 'lucide-react'
import { memo, useState } from 'react'
import { clipExportUrl, createClip, deleteClip } from '../api'
import type { Clip, MatchMeta } from '../types'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'

interface ClipPanelProps {
  meta: MatchMeta
  clipStart: number | null
  clipEnd: number | null
  clips: Clip[]
  onSetClipStart: () => void
  onSetClipEnd: () => void
  onClipsChange: () => void
  onSeek: (frame: number) => void
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export const ClipPanel = memo(function ClipPanel({
  meta,
  clipStart,
  clipEnd,
  clips,
  onSetClipStart,
  onSetClipEnd,
  onClipsChange,
  onSeek,
}: ClipPanelProps) {
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const fps = meta.fps
  const maxFrames = 10 * fps
  const duration =
    clipStart !== null && clipEnd !== null ? Math.abs(clipEnd - clipStart) / fps : 0
  const canSave =
    clipStart !== null && clipEnd !== null && clipEnd > clipStart && clipEnd - clipStart <= maxFrames

  const handleSave = async () => {
    if (!canSave || !title.trim()) {
      setError('Enter a title and select a valid 0–10 second range')
      return
    }
    setSaving(true)
    setError('')
    try {
      const start = Math.min(clipStart!, clipEnd!)
      const end = Math.max(clipStart!, clipEnd!)
      await createClip({
        title: title.trim(),
        start_frame: start,
        end_frame: end,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        notes,
      })
      setTitle('')
      setTags('')
      setNotes('')
      onClipsChange()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save clip')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    await deleteClip(id)
    onClipsChange()
  }

  const shareLink = (clip: Clip) => {
    const url = `${window.location.origin}${window.location.pathname}?clip=${clip.id}`
    navigator.clipboard.writeText(url)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-panel-border bg-panel p-4 space-y-3">
        <h2 className="text-lg font-semibold text-white">Create Clip</h2>
        <p className="text-xs text-slate-400">
          Mark start and end points on the timeline, then save a clip (max 10 seconds).
        </p>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onSetClipStart}>
            Set Start {clipStart !== null ? `(${formatTime(clipStart / fps)})` : ''}
          </Button>
          <Button variant="outline" size="sm" onClick={onSetClipEnd}>
            Set End {clipEnd !== null ? `(${formatTime(clipEnd / fps)})` : ''}
          </Button>
        </div>

        {duration > 0 && (
          <p className="text-sm text-slate-300">
            Selection: {duration.toFixed(1)}s ({Math.abs((clipEnd ?? 0) - (clipStart ?? 0))} frames)
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor="clip-title">Title</Label>
          <Input
            id="clip-title"
            placeholder="e.g. Goal buildup"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="clip-tags">Tags (comma-separated)</Label>
          <Input
            id="clip-tags"
            placeholder="goal, counter-attack"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="clip-notes">Notes</Label>
          <Input
            id="clip-notes"
            placeholder="Analyst notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <Button onClick={handleSave} disabled={!canSave || saving || !title.trim()}>
          {saving ? 'Saving...' : 'Save Clip'}
        </Button>
      </div>

      <div className="rounded-lg border border-panel-border bg-panel p-4 space-y-3">
        <h2 className="text-lg font-semibold text-white">Saved Clips</h2>
        {clips.length === 0 ? (
          <p className="text-sm text-slate-400">No clips yet. Create one above.</p>
        ) : (
          <ul className="space-y-2">
            {clips.map((clip) => (
              <li
                key={clip.id}
                className="flex items-start justify-between gap-2 rounded-md border border-panel-border p-3 hover:bg-panel-border/20"
              >
                <button
                  type="button"
                  className="text-left flex-1"
                  onClick={() => onSeek(clip.start_frame)}
                >
                  <p className="font-medium text-white">{clip.title}</p>
                  <p className="text-xs text-slate-400">
                    {formatTime(clip.start_time)} – {formatTime(clip.end_time)} ({clip.duration.toFixed(1)}s)
                  </p>
                  {clip.tags.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {clip.tags.map((tag) => (
                        <span key={tag} className="text-xs bg-accent/20 text-accent px-1.5 py-0.5 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" title="Copy share link" onClick={() => shareLink(clip)}>
                    <Link2 className="h-4 w-4" />
                  </Button>
                  <a href={clipExportUrl(clip.id, 'gif')} download>
                    <Button variant="ghost" size="icon" title="Download GIF">
                      <Download className="h-4 w-4" />
                    </Button>
                  </a>
                  <a href={clipExportUrl(clip.id, 'mp4')} download>
                    <Button variant="ghost" size="sm" title="Download MP4">MP4</Button>
                  </a>
                  <Button variant="ghost" size="icon" title="Delete" onClick={() => handleDelete(clip.id)}>
                    <Trash2 className="h-4 w-4 text-red-400" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
})
