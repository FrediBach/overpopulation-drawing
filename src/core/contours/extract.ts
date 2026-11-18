import type { BodyRegion } from '../assets/skeleton'
import type { BodyAsset } from '../body/asset'
import type { FeatureField } from '../body/features'
import type { Projector } from '../camera/projection'
import { vertexNormals } from '../mesh/topology'
import type { OccluderSet } from '../visibility/occluders'
import type { CandidateSegment } from './types'

export interface ExtractResult {
  bounds: { x0: number; y0: number; x1: number; y1: number }
  /** Number of chaining keys consumed (contour + feature edge keys). */
  keysUsed: number
}

/**
 * Project a posed body, register its front faces as occluders and emit
 * candidate curves:
 *  - smooth contours: zero crossings of the interpolated n·v across faces
 *    (Hertzmann & Zorin), which follow the body far more smoothly than
 *    mesh-edge silhouettes;
 *  - feature curves: zero crossings of authored rest-pose fields (swimwear, hair).
 * Each segment lies on one face, whose vertices suppress self-occlusion.
 */
export function extractBodyLines(
  asset: BodyAsset,
  positions: Float32Array,
  owner: number,
  vertexIdBase: number,
  keyBase: number,
  features: FeatureField[],
  projector: Projector,
  occluders: OccluderSet,
  out: CandidateSegment[],
): ExtractResult {
  const n = positions.length / 3
  const idx = asset.indices
  const topo = asset.topology
  const E = topo.edgeVerts.length / 2
  const projected = new Float64Array(n * 3)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let i = 0; i < n; i++) {
    projector.project(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2], projected, i * 3)
    const u = projected[i * 3]
    const v = projected[i * 3 + 1]
    if (u < x0) x0 = u
    if (u > x1) x1 = u
    if (v < y0) y0 = v
    if (v > y1) y1 = v
  }
  const [vx, vy, vz] = projector.viewDir
  const normals = vertexNormals(positions, idx)
  const g = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const d = normals[i * 3] * vx + normals[i * 3 + 1] * vy + normals[i * 3 + 2] * vz
    g[i] = d === 0 ? 1e-9 : d
  }
  const regionOf = (v: number): BodyRegion => asset.skeleton[asset.dominantBone[v]].region

  const F = idx.length / 3
  for (let f = 0; f < F; f++) {
    const i0 = idx[f * 3], i1 = idx[f * 3 + 1], i2 = idx[f * 3 + 2]
    const ax = positions[i0 * 3], ay = positions[i0 * 3 + 1], az = positions[i0 * 3 + 2]
    const e1x = positions[i1 * 3] - ax, e1y = positions[i1 * 3 + 1] - ay, e1z = positions[i1 * 3 + 2] - az
    const e2x = positions[i2 * 3] - ax, e2y = positions[i2 * 3 + 1] - ay, e2z = positions[i2 * 3 + 2] - az
    const nx = e1y * e2z - e1z * e2y
    const ny = e1z * e2x - e1x * e2z
    const nz = e1x * e2y - e1y * e2x
    if (nx * vx + ny * vy + nz * vz < 0) {
      occluders.add(
        projected[i0 * 3], projected[i0 * 3 + 1], projected[i0 * 3 + 2],
        projected[i1 * 3], projected[i1 * 3 + 1], projected[i1 * 3 + 2],
        projected[i2 * 3], projected[i2 * 3 + 1], projected[i2 * 3 + 2],
        vertexIdBase + i0, vertexIdBase + i1, vertexIdBase + i2,
        owner,
      )
    }
  }

  // Zero-crossing curves of a per-vertex scalar, one segment per crossing face.
  const crossings = (scalar: ArrayLike<number>, mask: Uint8Array | null, keyOffset: number, cls: 'contour' | 'feature') => {
    const verts = [0, 0, 0]
    const pts: number[] = []
    const keys: number[] = []
    for (let f = 0; f < F; f++) {
      verts[0] = idx[f * 3]
      verts[1] = idx[f * 3 + 1]
      verts[2] = idx[f * 3 + 2]
      if (mask && !(mask[verts[0]] && mask[verts[1]] && mask[verts[2]])) continue
      const s0 = scalar[verts[0]] < 0, s1 = scalar[verts[1]] < 0, s2 = scalar[verts[2]] < 0
      if (s0 === s1 && s1 === s2) continue
      pts.length = 0
      keys.length = 0
      for (let e = 0; e < 3; e++) {
        const a = verts[e]
        const b = verts[(e + 1) % 3]
        const ga = scalar[a]
        const gb = scalar[b]
        if (ga < 0 === gb < 0) continue
        // Interpolate along the canonical edge direction so neighbours agree exactly.
        const lo = a < b ? a : b
        const hi = a < b ? b : a
        const glo = lo === a ? ga : gb
        const ghi = lo === a ? gb : ga
        const t = glo / (glo - ghi)
        for (let k = 0; k < 3; k++) pts.push(projected[lo * 3 + k] + (projected[hi * 3 + k] - projected[lo * 3 + k]) * t)
        keys.push(keyBase + keyOffset + topo.faceEdges[f * 3 + e])
      }
      if (pts.length !== 6) continue
      out.push({
        u0: pts[0], v0: pts[1], d0: pts[2],
        u1: pts[3], v1: pts[4], d1: pts[5],
        s0: vertexIdBase + verts[0], s1: vertexIdBase + verts[1], s2: vertexIdBase + verts[2],
        k0: keys[0],
        k1: keys[1],
        owner,
        cls,
        region: regionOf(verts[0]),
      })
    }
  }
  crossings(g, null, 0, 'contour')
  features.forEach((feat, i) => crossings(feat.scalar, feat.mask, (i + 1) * E, 'feature'))
  return { bounds: { x0, y0, x1, y1 }, keysUsed: (features.length + 1) * E }
}
