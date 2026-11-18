import { featureRingsFor, type BodyMesh, type Outfit } from '../assets/bodyMesh'
import type { Projector } from '../camera/projection'
import type { OccluderSet } from '../visibility/occluders'
import type { CandidateSegment } from './types'

export interface ExtractResult {
  /** Projected vertices: u, v (mm), depth (m). */
  projected: Float64Array
  bounds: { x0: number; y0: number; x1: number; y1: number }
}

/**
 * Project a posed body, register its front-facing triangles as occluders and
 * emit candidate curves: camera-dependent silhouettes (front/back face
 * boundaries) and, when requested, authored feature rings. Back faces of a
 * closed surface never hide anything a front face does not, so only front
 * faces are kept as occluders.
 */
export function extractBodyLines(
  mesh: BodyMesh,
  owner: number,
  vertexIdBase: number,
  outfit: Outfit,
  includeFeatures: boolean,
  projector: Projector,
  occluders: OccluderSet,
  out: CandidateSegment[],
): ExtractResult {
  const { template, capsuleCount, positions } = mesh
  const V = template.vertexCount
  const F = template.faceCount
  const totalV = V * capsuleCount
  const projected = new Float64Array(totalV * 3)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let i = 0; i < totalV; i++) {
    projector.project(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2], projected, i * 3)
    const u = projected[i * 3]
    const v = projected[i * 3 + 1]
    if (u < x0) x0 = u
    if (u > x1) x1 = u
    if (v < y0) y0 = v
    if (v > y1) y1 = v
  }
  const [vx, vy, vz] = projector.viewDir
  const front = new Uint8Array(F)
  const idx = template.indices
  const features = includeFeatures ? featureRingsFor(outfit) : []

  for (let c = 0; c < capsuleCount; c++) {
    const vo = c * V
    for (let f = 0; f < F; f++) {
      const i0 = vo + idx[f * 3], i1 = vo + idx[f * 3 + 1], i2 = vo + idx[f * 3 + 2]
      const ax = positions[i0 * 3], ay = positions[i0 * 3 + 1], az = positions[i0 * 3 + 2]
      const e1x = positions[i1 * 3] - ax, e1y = positions[i1 * 3 + 1] - ay, e1z = positions[i1 * 3 + 2] - az
      const e2x = positions[i2 * 3] - ax, e2y = positions[i2 * 3 + 1] - ay, e2z = positions[i2 * 3 + 2] - az
      const nx = e1y * e2z - e1z * e2y
      const ny = e1z * e2x - e1x * e2z
      const nz = e1x * e2y - e1y * e2x
      const isFront = nx * vx + ny * vy + nz * vz < 0
      front[f] = isFront ? 1 : 0
      if (isFront) {
        occluders.add(
          projected[i0 * 3], projected[i0 * 3 + 1], projected[i0 * 3 + 2],
          projected[i1 * 3], projected[i1 * 3 + 1], projected[i1 * 3 + 2],
          projected[i2 * 3], projected[i2 * 3 + 1], projected[i2 * 3 + 2],
          vertexIdBase + i0, vertexIdBase + i1, vertexIdBase + i2,
          owner,
        )
      }
    }
    const bone = mesh.capsuleBones[c]
    const region = mesh.capsuleRegions[c]
    const featureRings = new Set(features.filter((r) => r.bone === bone).map((r) => r.ring))
    const E = template.edgeVerts.length / 2
    for (let e = 0; e < E; e++) {
      const fa = front[template.edgeFaces[e * 2]]
      const fb = front[template.edgeFaces[e * 2 + 1]]
      const silhouette = fa !== fb
      const feature = !silhouette && (fa || fb) && featureRings.size > 0 && featureRings.has(template.edgeRing[e])
      if (!silhouette && !feature) continue
      const a = vo + template.edgeVerts[e * 2]
      const b = vo + template.edgeVerts[e * 2 + 1]
      out.push({
        u0: projected[a * 3], v0: projected[a * 3 + 1], d0: projected[a * 3 + 2],
        u1: projected[b * 3], v1: projected[b * 3 + 1], d1: projected[b * 3 + 2],
        ia: vertexIdBase + a,
        ib: vertexIdBase + b,
        owner,
        cls: silhouette ? 'contour' : 'feature',
        region,
      })
    }
  }
  return { projected, bounds: { x0, y0, x1, y1 } }
}
