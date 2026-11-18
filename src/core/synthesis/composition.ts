import { ARCHETYPES } from '../poses/archetypes'
import { POSTURES, type Posture } from '../poses/types'
import { createRng } from '../math/rng'
import { clamp, DEG, lerp } from '../math/geometry'
import { drawableSize, type PaperProfile } from '../scene/paper'
import type { BeachLayout, SceneSettings } from '../scene/types'

/** People are allowed to extend this far beyond the frame so the crowd continues off-page. */
export const FRAME_OVERSCAN_M = 0.6

function averageFootprint(mix: Record<Posture, number>): number {
  let total = 0
  let w = 0
  for (const posture of POSTURES) {
    const fp = ARCHETYPES[posture].footprint
    const weight = Math.max(0, mix[posture])
    total += fp * weight
    w += weight
  }
  return w > 0 ? total / w : 0.7
}

/**
 * Size the framed view so that the requested population can plausibly fit
 * at the requested crowding. This is a sizing heuristic, not a guarantee:
 * the scene compiler reports any shortfall explicitly.
 */
export function viewWidthFor(settings: SceneSettings, paper: PaperProfile): number {
  const { width, height } = drawableSize(paper)
  const spacing = lerp(2.2, 0.8, clamp(settings.crowding, 0, 1))
  const usable = 0.74 // water, pockets and the route are not available
  const area = (settings.population * averageFootprint(settings.postureMix) * spacing) / usable
  const sinE = Math.sin(settings.elevationDeg * DEG)
  // ground area = W * D with D = W * (h / w) / sin(e)
  const k = height / width / sinE
  return Math.max(4, Math.sqrt(area / k))
}

export function createBeachLayout(settings: SceneSettings, viewWidth: number, viewHeight: number): BeachLayout {
  const rng = createRng(settings.seed, 'composition')
  const sinE = Math.sin(settings.elevationDeg * DEG)
  const halfWidth = viewWidth / 2 + FRAME_OVERSCAN_M
  const halfDepth = viewHeight / sinE / 2 + FRAME_OVERSCAN_M
  const W = halfWidth * 2
  const D = halfDepth * 2
  const shoreBase = -halfDepth + D * rng.range(0.13, 0.18)
  const shoreWaves = [
    { amp: D * 0.02, freq: (2 * Math.PI) / (W * rng.range(0.5, 0.9)), phase: rng.range(0, 6.28) },
    { amp: D * 0.008, freq: (2 * Math.PI) / (W * rng.range(0.12, 0.2)), phase: rng.range(0, 6.28) },
  ]
  const blobs = [
    { x: rng.range(-0.15, 0.15) * W, z: rng.range(-0.05, 0.15) * D, r: 0.3 * W, weight: 0.45 },
    { x: rng.range(-0.35, 0.35) * W, z: rng.range(0, 0.3) * D, r: 0.12 * W, weight: 0.7 },
  ]
  const pocketCount = 2 + rng.int(0, 2)
  const pockets = Array.from({ length: pocketCount }, () => ({
    x: rng.range(-0.4, 0.4) * W,
    z: rng.range(-0.25, 0.4) * D,
    r: rng.range(0.6, 1.4) + 0.015 * W,
  }))
  const cx0 = rng.range(-0.3, 0.3) * W
  const cx1 = cx0 + rng.range(-0.15, 0.15) * W
  const corridor: [number, number][] = []
  for (let i = 0; i <= 8; i++) {
    const t = i / 8
    const z = lerp(halfDepth, shoreBase, t)
    corridor.push([lerp(cx0, cx1, t) + Math.sin(t * 5 + cx0) * 0.6, z])
  }
  return {
    halfWidth,
    halfDepth,
    shoreBase,
    shoreWaves,
    baseDensity: 0.55,
    blobs,
    pockets,
    corridor,
    corridorWidth: 0.9,
  }
}

export function shorelineZ(layout: BeachLayout, x: number): number {
  let z = layout.shoreBase
  for (const w of layout.shoreWaves) z += w.amp * Math.sin(w.freq * x + w.phase)
  return z
}

function distToPolyline(pts: [number, number][], x: number, z: number): number {
  let best = Infinity
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1]
    const [bx, bz] = pts[i]
    const dx = bx - ax, dz = bz - az
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1)
    best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz))
  }
  return best
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Desired crowding in [0, 1]. It shapes placement; it never overrides validity. */
export function densityAt(layout: BeachLayout, x: number, z: number): number {
  if (Math.abs(x) > layout.halfWidth || Math.abs(z) > layout.halfDepth) return 0
  const shore = shorelineZ(layout, x)
  if (z < shore + 0.5) return 0
  let d = layout.baseDensity
  for (const b of layout.blobs) {
    d += b.weight * Math.exp(-((x - b.x) ** 2 + (z - b.z) ** 2) / (b.r * b.r))
  }
  // Wet sand close to the water is thinner.
  d *= smooth(shore + 0.5, shore + 2.5, z) * 0.7 + 0.3
  for (const p of layout.pockets) {
    d *= smooth(p.r * 0.85, p.r * 1.25, Math.hypot(x - p.x, z - p.z))
  }
  d *= 0.04 + 0.96 * smooth(layout.corridorWidth * 0.5, layout.corridorWidth * 1.1, distToPolyline(layout.corridor, x, z))
  return clamp(d, 0, 1)
}

export function isInWater(layout: BeachLayout, x: number, z: number): boolean {
  return z < shorelineZ(layout, x)
}

/** Preferred facing: towards the sea (-Z) with a slowly varying drift. */
export function preferredYaw(x: number, z: number): number {
  return Math.PI + 0.5 * Math.sin(x * 0.17 + 1.3) * Math.cos(z * 0.11) + 0.12 * Math.sin(x * 0.9 - z * 0.7)
}
