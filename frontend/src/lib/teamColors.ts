export type Rgb = [number, number, number]

/** Pitch fill used by the canvas (`#1a5c2e`). */
const PITCH: Rgb = [26, 92, 46]
const MIN_PITCH_CONTRAST = 3

const FALLBACKS: Rgb[] = [
  [255, 196, 46],
  [64, 214, 255],
  [255, 92, 138],
  [186, 255, 92],
  [255, 122, 46],
]

export type TeamKits = {
  home: Rgb
  away: Rgb
  homeInk: string
  awayInk: string
  homeCss: string
  awayCss: string
}

function channel(c: number): number {
  const x = c / 255
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
}

function luminance(rgb: Rgb): number {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2])
}

function contrast(a: Rgb, b: Rgb): number {
  const l1 = luminance(a)
  const l2 = luminance(b)
  const hi = Math.max(l1, l2)
  const lo = Math.min(l1, l2)
  return (hi + 0.05) / (lo + 0.05)
}

function rgbToHsl(rgb: Rgb): [number, number, number] {
  const r = rgb[0] / 255
  const g = rgb[1] / 255
  const b = rgb[2] / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [((h * 60) + 360) % 360, s, l]
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = ((h % 360) + 360) % 360 / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = l - c / 2
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ]
}

/** Saturated gold vs white is obvious on the pitch even though both are light. */
function distinct(a: Rgb, b: Rgb): boolean {
  if (contrast(a, b) >= 3) return true
  const [h1, s1, l1] = rgbToHsl(a)
  const [h2, s2, l2] = rgbToHsl(b)
  const whiteA = s1 < 0.18 && l1 > 0.82
  const whiteB = s2 < 0.18 && l2 > 0.82
  if (whiteA && s2 >= 0.7 && l2 <= 0.7) return true
  if (whiteB && s1 >= 0.7 && l1 <= 0.7) return true
  const hueDelta = Math.min(Math.abs(h1 - h2), 360 - Math.abs(h1 - h2))
  return hueDelta >= 35 && s1 >= 0.45 && s2 >= 0.45
}

function lighten(rgb: Rgb): Rgb[] {
  const [h, s, l] = rgbToHsl(rgb)
  const steps: Rgb[] = []
  for (let i = 1; i <= 14; i++) {
    steps.push(hslToRgb(h, Math.max(s, 0.72), Math.min(0.72, l + i * 0.035)))
  }
  return steps
}

function pickFallback(other: Rgb | null): Rgb {
  for (const color of FALLBACKS) {
    if (contrast(color, PITCH) < MIN_PITCH_CONTRAST) continue
    if (other && !distinct(color, other)) continue
    return color
  }
  return FALLBACKS[0]
}

function fit(rgb: Rgb, other: Rgb | null): Rgb {
  const options = [rgb, ...lighten(rgb)]
  for (const color of options) {
    if (contrast(color, PITCH) < MIN_PITCH_CONTRAST) continue
    if (other && !distinct(color, other)) continue
    return color
  }
  return pickFallback(other)
}

export function cssRgb(rgb: Rgb): string {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
}

/** Black or white numeral, whichever reads on the kit fill. */
export function inkColor(rgb: Rgb): string {
  const black: Rgb = [17, 17, 17]
  const white: Rgb = [255, 255, 255]
  return contrast(rgb, white) >= contrast(rgb, black) ? '#ffffff' : '#111111'
}

/**
 * Keep a metadata kit when it shows up on the dark pitch and is not the same
 * color as the other team. Otherwise substitute a high-contrast fallback.
 */
const kitCache = new Map<string, TeamKits>()

export function teamKits(homeIn: Rgb, awayIn: Rgb): TeamKits {
  const key = `${homeIn.join(',')}|${awayIn.join(',')}`
  const cached = kitCache.get(key)
  if (cached) return cached

  let home: Rgb
  let away: Rgb
  if (contrast(homeIn, PITCH) >= contrast(awayIn, PITCH)) {
    home = fit(homeIn, null)
    away = fit(awayIn, home)
  } else {
    away = fit(awayIn, null)
    home = fit(homeIn, away)
  }

  const kits: TeamKits = {
    home,
    away,
    homeInk: inkColor(home),
    awayInk: inkColor(away),
    homeCss: cssRgb(home),
    awayCss: cssRgb(away),
  }
  kitCache.set(key, kits)
  return kits
}
