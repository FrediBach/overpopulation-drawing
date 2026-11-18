/**
 * Edge adjacency for an arbitrary triangle mesh, computed once per asset.
 * Edges with other than two incident faces (boundaries, rare non-manifold
 * spots) are flagged so line extraction can treat them conservatively.
 */
export interface MeshTopology {
  vertexCount: number
  faceCount: number
  edgeVerts: Uint32Array
  /** Two faces per edge; 0xffffffff when missing. */
  edgeFaces: Uint32Array
  /** Three edge ids per face, in the order (v0v1, v1v2, v2v0). */
  faceEdges: Uint32Array
  manifold: boolean
}

export const NO_FACE = 0xffffffff

export function buildTopology(indices: Uint32Array, vertexCount: number): MeshTopology {
  const faceCount = indices.length / 3
  const map = new Map<number, number>()
  const ev: number[] = []
  const ef: number[] = []
  const faceEdges = new Uint32Array(faceCount * 3)
  let manifold = true
  for (let f = 0; f < faceCount; f++) {
    for (let e = 0; e < 3; e++) {
      const a = indices[f * 3 + e]
      const b = indices[f * 3 + ((e + 1) % 3)]
      const lo = Math.min(a, b)
      const hi = Math.max(a, b)
      const key = lo * vertexCount + hi
      let id = map.get(key)
      if (id === undefined) {
        id = ev.length / 2
        map.set(key, id)
        ev.push(lo, hi)
        ef.push(f, NO_FACE)
      } else if (ef[id * 2 + 1] === NO_FACE) {
        ef[id * 2 + 1] = f
      } else {
        manifold = false
      }
      faceEdges[f * 3 + e] = id
    }
  }
  for (let i = 1; i < ef.length; i += 2) if (ef[i] === NO_FACE) manifold = false
  return {
    vertexCount,
    faceCount,
    edgeVerts: new Uint32Array(ev),
    edgeFaces: new Uint32Array(ef),
    faceEdges,
    manifold,
  }
}

/** Area-weighted vertex normals (unnormalised face normals summed). */
export function vertexNormals(positions: ArrayLike<number>, indices: Uint32Array, out?: Float32Array): Float32Array {
  const n = out ?? new Float32Array(positions.length)
  n.fill(0)
  for (let f = 0; f < indices.length; f += 3) {
    const a = indices[f] * 3, b = indices[f + 1] * 3, c = indices[f + 2] * 3
    const e1x = positions[b] - positions[a], e1y = positions[b + 1] - positions[a + 1], e1z = positions[b + 2] - positions[a + 2]
    const e2x = positions[c] - positions[a], e2y = positions[c + 1] - positions[a + 1], e2z = positions[c + 2] - positions[a + 2]
    const nx = e1y * e2z - e1z * e2y
    const ny = e1z * e2x - e1x * e2z
    const nz = e1x * e2y - e1y * e2x
    for (const v of [a, b, c]) {
      n[v] += nx
      n[v + 1] += ny
      n[v + 2] += nz
    }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1
    n[i] /= l
    n[i + 1] /= l
    n[i + 2] /= l
  }
  return n
}

export function signedVolume(positions: ArrayLike<number>, indices: Uint32Array): number {
  let vol = 0
  for (let f = 0; f < indices.length; f += 3) {
    const a = indices[f] * 3, b = indices[f + 1] * 3, c = indices[f + 2] * 3
    vol +=
      (positions[a] * (positions[b + 1] * positions[c + 2] - positions[b + 2] * positions[c + 1]) -
        positions[a + 1] * (positions[b] * positions[c + 2] - positions[b + 2] * positions[c]) +
        positions[a + 2] * (positions[b] * positions[c + 1] - positions[b + 1] * positions[c])) /
      6
  }
  return vol
}
