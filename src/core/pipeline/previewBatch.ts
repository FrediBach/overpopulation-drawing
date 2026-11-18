import { getBodyAsset, PREVIEW_CELL } from '../body/asset'
import { skinBody } from '../body/skin'
import { vertexNormals } from '../mesh/topology'
import type { SceneSnapshot } from '../scene/types'
import { personMatrices } from '../synthesis/personGeometry'

/**
 * All accepted bodies frozen into one indexed geometry with per-person
 * vertex and face ranges (plan §8). Built off the main thread and transferred.
 */
export interface PreviewBatch {
  positions: Float32Array
  normals: Float32Array
  indices: Uint32Array
  /** personVertexStart[i]..personVertexStart[i+1] are person i's vertices. */
  personVertexStart: Uint32Array
  personFaceStart: Uint32Array
}

export function buildPreviewBatch(scene: SceneSnapshot, onProgress?: (f: number, label: string) => void): PreviewBatch {
  const posed = scene.people.map((p, i) => {
    const asset = getBodyAsset(scene.bodies[p.bodyIndex], PREVIEW_CELL)
    if (i % 50 === 0) onProgress?.(i / scene.people.length, 'Preparing preview')
    return { asset, positions: skinBody(asset, personMatrices(p, scene.bodies)) }
  })
  const vertexStart = new Uint32Array(posed.length + 1)
  const faceStart = new Uint32Array(posed.length + 1)
  posed.forEach((p, i) => {
    vertexStart[i + 1] = vertexStart[i] + p.positions.length / 3
    faceStart[i + 1] = faceStart[i] + p.asset.indices.length / 3
  })
  const positions = new Float32Array(vertexStart[posed.length] * 3)
  const normals = new Float32Array(positions.length)
  const indices = new Uint32Array(faceStart[posed.length] * 3)
  posed.forEach((p, i) => {
    positions.set(p.positions, vertexStart[i] * 3)
    normals.set(vertexNormals(p.positions, p.asset.indices), vertexStart[i] * 3)
    const base = vertexStart[i]
    const src = p.asset.indices
    const off = faceStart[i] * 3
    for (let k = 0; k < src.length; k++) indices[off + k] = src[k] + base
  })
  return { positions, normals, indices, personVertexStart: vertexStart, personFaceStart: faceStart }
}
