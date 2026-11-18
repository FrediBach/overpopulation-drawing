export interface PaperProfile {
  id: string
  label: string
  widthMm: number
  heightMm: number
  marginMm: number
  penWidthMm: number
}

export const PAPER_PROFILES: readonly PaperProfile[] = [
  { id: 'A3', label: 'A3 landscape', widthMm: 420, heightMm: 297, marginMm: 15, penWidthMm: 0.25 },
  { id: 'A2', label: 'A2 landscape', widthMm: 594, heightMm: 420, marginMm: 20, penWidthMm: 0.25 },
  { id: 'A1', label: 'A1 landscape', widthMm: 841, heightMm: 594, marginMm: 25, penWidthMm: 0.25 },
]

export const PAPER_BY_ID: Record<string, PaperProfile> = Object.fromEntries(PAPER_PROFILES.map((p) => [p.id, p]))

export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

export function drawableRect(paper: PaperProfile): Rect {
  return {
    x0: paper.marginMm,
    y0: paper.marginMm,
    x1: paper.widthMm - paper.marginMm,
    y1: paper.heightMm - paper.marginMm,
  }
}

export function drawableSize(paper: PaperProfile): { width: number; height: number } {
  return { width: paper.widthMm - 2 * paper.marginMm, height: paper.heightMm - 2 * paper.marginMm }
}
