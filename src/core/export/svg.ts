import type { PaperProfile } from '../scene/paper'
import type { Stroke } from '../strokes/types'
import type { LineClass } from '../contours/types'

const LAYERS: { cls: LineClass; id: string; label: string }[] = [
  { cls: 'contour', id: 'body-contours', label: '1 body contours' },
  { cls: 'feature', id: 'body-details', label: '2 body details' },
  { cls: 'environment', id: 'environment', label: '3 environment' },
]

const fmt = (v: number) => (Math.round(v * 1000) / 1000).toString()

export interface SvgOptions {
  /** Include per-stroke owner ids as data attributes (useful for review, larger file). */
  attribution?: boolean
  title?: string
}

/**
 * Physical SVG: width/height in millimetres with a matching viewBox, open
 * or closed polylines only, fill none, no masks, images or white fills
 * (plan §10). Semantic Inkscape layers per line class.
 */
export function strokesToSvg(strokes: Stroke[], paper: PaperProfile, opts: SvgOptions = {}): string {
  const out: string[] = []
  out.push('<?xml version="1.0" encoding="UTF-8"?>')
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" ` +
      `width="${paper.widthMm}mm" height="${paper.heightMm}mm" viewBox="0 0 ${paper.widthMm} ${paper.heightMm}">`,
  )
  if (opts.title) out.push(`<title>${opts.title.replace(/[<&>]/g, '')}</title>`)
  for (const layer of LAYERS) {
    const items = strokes.filter((s) => s.cls === layer.cls)
    out.push(
      `<g id="${layer.id}" inkscape:groupmode="layer" inkscape:label="${layer.label}" fill="none" stroke="black" ` +
        `stroke-width="${paper.penWidthMm}" stroke-linecap="round" stroke-linejoin="round">`,
    )
    for (const s of items) {
      const pts: string[] = []
      for (let i = 0; i < s.points.length; i += 2) pts.push(`${fmt(s.points[i])},${fmt(s.points[i + 1])}`)
      const tag = s.closed ? 'polygon' : 'polyline'
      const attr = opts.attribution && s.owner >= 0 ? ` data-person="${s.owner}"` : ''
      out.push(`<${tag}${attr} points="${pts.join(' ')}"/>`)
    }
    out.push('</g>')
  }
  out.push('</svg>')
  return out.join('\n')
}
