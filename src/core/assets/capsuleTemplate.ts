/**
 * Shared topology for an elliptical capsule. Every body segment uses the
 * same template, so edge/face adjacency is computed once and reused for all
 * people (plan §5: "build surface adjacency once per asset").
 */

export interface MeshResolution {
  /** Vertices around each ring. */
  radial: number
  /** Rings per hemispherical cap, including the equator. */
  capRings: number
  /** Cylinder subdivisions between the two equators. */
  midRings: number
}

export const PREVIEW_RESOLUTION: MeshResolution = { radial: 10, capRings: 3, midRings: 2 }
export const EXPORT_RESOLUTION: MeshResolution = { radial: 14, capRings: 4, midRings: 2 }

/** Named rings that may be selected as authored feature curves. */
export type RingTag = 'aEquator' | 'mid' | 'bEquator' | 'other'

export interface CapsuleTemplate {
  resolution: MeshResolution
  vertexCount: number
  faceCount: number
  /** Per vertex: [t along axis 0..1, sinPhi, cosPhi, cosTheta, sinTheta]. */
  params: Float64Array
  /** Triangle indices, outward (counter-clockwise) winding. */
  indices: Uint32Array
  /** Unique undirected edges: [v0, v1] pairs. */
  edgeVerts: Uint32Array
  /** Adjacent faces per edge: [f0, f1]. The template is closed, so both exist. */
  edgeFaces: Uint32Array
  /** Ring tag per edge for edges that run along a ring, else 'other'. */
  edgeRing: RingTag[]
}

const cache = new Map<string, CapsuleTemplate>()

export function getCapsuleTemplate(res: MeshResolution): CapsuleTemplate {
  const key = `${res.radial}/${res.capRings}/${res.midRings}`
  let t = cache.get(key)
  if (!t) {
    t = buildTemplate(res)
    cache.set(key, t)
  }
  return t
}

function buildTemplate(res: MeshResolution): CapsuleTemplate {
  const { radial: N, capRings: R, midRings: M } = res
  interface Ring {
    t: number
    phi: number
    tag: RingTag
  }
  const rings: Ring[] = []
  for (let k = 1; k < R; k++) rings.push({ t: 0, phi: -Math.PI / 2 + (Math.PI / 2) * (k / R), tag: 'other' })
  rings.push({ t: 0, phi: 0, tag: 'aEquator' })
  for (let i = 1; i < M; i++) rings.push({ t: i / M, phi: 0, tag: i === Math.floor(M / 2) ? 'mid' : 'other' })
  rings.push({ t: 1, phi: 0, tag: 'bEquator' })
  for (let k = 1; k < R; k++) rings.push({ t: 1, phi: (Math.PI / 2) * (k / R), tag: 'other' })

  const vertexCount = 2 + rings.length * N
  const params = new Float64Array(vertexCount * 5)
  const setV = (i: number, t: number, phi: number, theta: number) => {
    params.set([t, Math.sin(phi), Math.cos(phi), Math.cos(theta), Math.sin(theta)], i * 5)
  }
  const bottom = 0
  setV(bottom, 0, -Math.PI / 2, 0)
  const ringStart = (r: number) => 1 + r * N
  rings.forEach((ring, r) => {
    for (let j = 0; j < N; j++) setV(ringStart(r) + j, ring.t, ring.phi, (2 * Math.PI * j) / N)
  })
  const top = vertexCount - 1
  setV(top, 1, Math.PI / 2, 0)

  const idx: number[] = []
  for (let j = 0; j < N; j++) {
    const j1 = (j + 1) % N
    idx.push(bottom, ringStart(0) + j, ringStart(0) + j1)
  }
  for (let r = 0; r < rings.length - 1; r++) {
    for (let j = 0; j < N; j++) {
      const j1 = (j + 1) % N
      const l0 = ringStart(r) + j
      const l1 = ringStart(r) + j1
      const u0 = ringStart(r + 1) + j
      const u1 = ringStart(r + 1) + j1
      idx.push(l0, u1, l1, l0, u0, u1)
    }
  }
  const last = ringStart(rings.length - 1)
  for (let j = 0; j < N; j++) {
    const j1 = (j + 1) % N
    idx.push(top, last + j1, last + j)
  }
  const indices = new Uint32Array(idx)
  const faceCount = indices.length / 3

  // Edge adjacency.
  const edgeMap = new Map<number, number>()
  const ev: number[] = []
  const ef: number[] = []
  for (let f = 0; f < faceCount; f++) {
    for (let e = 0; e < 3; e++) {
      const a = indices[f * 3 + e]
      const b = indices[f * 3 + ((e + 1) % 3)]
      const lo = Math.min(a, b)
      const hi = Math.max(a, b)
      const key = lo * vertexCount + hi
      const existing = edgeMap.get(key)
      if (existing === undefined) {
        edgeMap.set(key, ev.length / 2)
        ev.push(lo, hi)
        ef.push(f, 0xffffffff)
      } else {
        ef[existing * 2 + 1] = f
      }
    }
  }
  const edgeRing: RingTag[] = []
  for (let e = 0; e < ev.length / 2; e++) {
    const a = ev[e * 2]
    const b = ev[e * 2 + 1]
    let tag: RingTag = 'other'
    if (a !== bottom && a !== top && b !== bottom && b !== top) {
      const ra = Math.floor((a - 1) / N)
      const rb = Math.floor((b - 1) / N)
      if (ra === rb) tag = rings[ra].tag
    }
    edgeRing.push(tag)
  }
  return {
    resolution: res,
    vertexCount,
    faceCount,
    params,
    indices,
    edgeVerts: new Uint32Array(ev),
    edgeFaces: new Uint32Array(ef),
    edgeRing,
  }
}
