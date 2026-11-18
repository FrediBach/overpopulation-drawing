import type { Projector } from '../camera/projection'
import { createRng } from '../math/rng'
import { shorelineZ } from '../synthesis/composition'
import type { SceneSnapshot } from '../scene/types'
import type { CandidateSegment } from './types'

const SAND_Y = 0.003

/**
 * Sparse environment marks (plan §3): towel outlines, the shoreline and a
 * few broken wave lines. They are candidates like body curves and pass
 * through the same hidden-line removal.
 */
export function environmentSegments(scene: SceneSnapshot, projector: Projector, firstKey: number): CandidateSegment[] {
  const out: CandidateSegment[] = []
  let vid = firstKey
  const tmp = [0, 0, 0]

  const polyline = (pts: [number, number, number][], closed: boolean) => {
    const ids = pts.map(() => vid++)
    const proj = pts.map(([x, y, z]) => {
      projector.project(x, y, z, tmp)
      return [tmp[0], tmp[1], tmp[2]]
    })
    const n = closed ? pts.length : pts.length - 1
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % pts.length
      out.push({
        u0: proj[i][0], v0: proj[i][1], d0: proj[i][2],
        u1: proj[j][0], v1: proj[j][1], d1: proj[j][2],
        s0: -1,
        s1: -1,
        s2: -1,
        k0: ids[i],
        k1: ids[j],
        owner: -1,
        cls: 'environment',
        region: 'environment',
      })
    }
  }

  for (const t of scene.towels) {
    const c = Math.cos(t.yaw)
    const s = Math.sin(t.yaw)
    const hw = t.width / 2
    const hl = t.length / 2
    const corners: [number, number, number][] = [
      [-hw, SAND_Y, -hl],
      [hw, SAND_Y, -hl],
      [hw, SAND_Y, hl],
      [-hw, SAND_Y, hl],
    ].map(([x, y, z]) => [t.x + x * c + z * s, y, t.z - x * s + z * c])
    polyline(corners, true)
  }

  const { beach } = scene
  const step = 0.25
  const shore: [number, number, number][] = []
  for (let x = -beach.halfWidth; x <= beach.halfWidth + 1e-9; x += step) shore.push([x, 0.001, shorelineZ(beach, x)])
  polyline(shore, false)

  // Broken wave lines in the water.
  const rng = createRng(scene.settings.seed, 'waves')
  for (const offset of [0.9, 2.1, 3.6]) {
    let x = -beach.halfWidth + rng.range(0, 2)
    while (x < beach.halfWidth) {
      const len = rng.range(0.8, 3.5)
      const pts: [number, number, number][] = []
      for (let xi = x; xi <= Math.min(x + len, beach.halfWidth); xi += step) {
        pts.push([xi, 0, shorelineZ(beach, xi) - offset - 0.15 * Math.sin(xi * 1.7 + offset)])
      }
      if (pts.length >= 2) polyline(pts, false)
      x += len + rng.range(1.2, 4)
    }
  }
  return out
}
