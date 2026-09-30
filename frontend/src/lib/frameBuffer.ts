import { fetchFramesBatch } from '../api'
import type { TrackingFrame } from '../types'

/** Inclusive span length. Backend rejects end - start > 200. */
const BATCH = 200
const MAX_ACTIVE = 2
const MAX_QUEUED = 4
const MAX_CACHED = 3600

type Span = { start: number; end: number; pri: number }

/**
 * Deduped batch prefetch with a small in-memory window.
 * Scrub requests (higher priority) replace queued playback spans so a drag
 * is not stuck behind a long lookahead.
 */
export class FrameBuffer {
  private readonly cache = new Map<number, TrackingFrame>()
  private readonly order: number[] = []
  private readonly queue: Span[] = []
  private readonly queuedKeys = new Set<string>()
  private readonly inflightKeys = new Set<string>()
  private readonly failedUntil = new Map<string, number>()
  private active = 0
  private generation = 0
  private protectLo = 0
  private protectHi = 0
  private readonly frameCount: number

  constructor(frameCount: number) {
    this.frameCount = frameCount
  }

  has(frame: number): boolean {
    return this.cache.has(frame)
  }

  get(frame: number): TrackingFrame | undefined {
    return this.cache.get(frame)
  }

  /** How many frames are cached contiguously starting at `from`. */
  runway(from: number): number {
    const limit = Math.min(this.frameCount, from + BATCH + 40)
    let n = 0
    for (let i = from; i < limit; i++) {
      if (!this.cache.has(i)) break
      n++
    }
    return n
  }

  protect(center: number): void {
    this.protectLo = Math.max(0, center - 250)
    this.protectHi = Math.min(this.frameCount - 1, center + 500)
  }

  /** Queue any missing frames in [start, end] inclusive. */
  ensure(start: number, end: number, priority: number): void {
    if (this.frameCount <= 0) return
    const lo = clamp(start, 0, this.frameCount - 1)
    const hi = clamp(end, 0, this.frameCount - 1)
    if (hi < lo) return

    if (priority > 0) this.dropQueuedBelow(priority)

    let i = lo
    while (i <= hi) {
      if (this.cache.has(i)) {
        i++
        continue
      }
      const spanEnd = Math.min(hi, i + BATCH - 1)
      let j = i
      while (j <= spanEnd && !this.cache.has(j)) j++
      if (j > i) this.enqueue(i, j - 1, priority)
      i = j > i ? j : i + 1
    }
    this.pump()
  }

  dispose(): void {
    this.generation++
    this.queue.length = 0
    this.queuedKeys.clear()
  }

  private enqueue(start: number, end: number, pri: number): void {
    const key = `${start}:${end}`
    if (this.queuedKeys.has(key) || this.inflightKeys.has(key)) return
    const retryAt = this.failedUntil.get(key)
    if (retryAt != null && performance.now() < retryAt) return

    this.queuedKeys.add(key)
    const span = { start, end, pri }
    if (pri > 0) this.queue.unshift(span)
    else this.queue.push(span)

    while (this.queue.length > MAX_QUEUED) {
      const dropped = this.queue.pop()
      if (dropped) this.queuedKeys.delete(`${dropped.start}:${dropped.end}`)
    }
  }

  private dropQueuedBelow(priority: number): void {
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const item = this.queue[i]
      if (item.pri >= priority) continue
      this.queuedKeys.delete(`${item.start}:${item.end}`)
      this.queue.splice(i, 1)
    }
  }

  private pump(): void {
    while (this.active < MAX_ACTIVE && this.queue.length > 0) {
      const item = this.queue.shift()!
      const key = `${item.start}:${item.end}`
      this.queuedKeys.delete(key)
      if (this.spanReady(item.start, item.end) || this.inflightKeys.has(key)) continue

      this.inflightKeys.add(key)
      this.active++
      const gen = this.generation
      fetchFramesBatch(item.start, item.end)
        .then((frames) => {
          if (gen !== this.generation) return
          for (const frame of frames) this.insert(frame)
        })
        .catch(() => {
          if (gen === this.generation) this.failedUntil.set(key, performance.now() + 800)
        })
        .finally(() => {
          this.inflightKeys.delete(key)
          this.active = Math.max(0, this.active - 1)
          if (gen === this.generation) this.pump()
        })
    }
  }

  private spanReady(start: number, end: number): boolean {
    for (let i = start; i <= end; i++) {
      if (!this.cache.has(i)) return false
    }
    return true
  }

  private insert(frame: TrackingFrame): void {
    const n = frame.frame
    if (!this.cache.has(n)) this.order.push(n)
    this.cache.set(n, frame)
    this.evict()
  }

  private evict(): void {
    let guard = 0
    while (this.cache.size > MAX_CACHED && this.order.length > 0 && guard < this.order.length) {
      const n = this.order.shift()!
      if (!this.cache.has(n)) continue
      if (n >= this.protectLo && n <= this.protectHi) {
        this.order.push(n)
        guard++
        continue
      }
      this.cache.delete(n)
      guard = 0
    }
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}
