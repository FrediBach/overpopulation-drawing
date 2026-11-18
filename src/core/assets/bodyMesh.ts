import type { Capsule } from '../poses/fk'
import type { BodyRegion, BoneName } from './skeleton'
import { getCapsuleTemplate, type CapsuleTemplate, type MeshResolution, type RingTag } from './capsuleTemplate'

/**
 * Posed, world-space triangle surface of one person: the baked geometry
 * that both the preview and the drawing compiler consume (plan §9).
 */
export interface BodyMesh {
  template: CapsuleTemplate
  capsuleCount: number
  /** xyz per vertex, world metres. */
  positions: Float32Array
  /** Body region and bone per capsule (index = capsule). */
  capsuleBones: BoneName[]
  capsuleRegions: BodyRegion[]
}

export function buildBodyMesh(capsules: Capsule[], res: MeshResolution): BodyMesh {
  const template = getCapsuleTemplate(res)
  const V = template.vertexCount
  const positions = new Float32Array(capsules.length * V * 3)
  const p = template.params
  capsules.forEach((c, ci) => {
    const base = ci * V * 3
    for (let v = 0; v < V; v++) {
      const t = p[v * 5]
      const sinPhi = p[v * 5 + 1]
      const cosPhi = p[v * 5 + 2]
      const cosT = p[v * 5 + 3]
      const sinT = p[v * 5 + 4]
      const ex = c.rx * cosT * cosPhi
      const ez = c.rz * sinT * cosPhi
      const ey = c.rcap * sinPhi
      for (let k = 0; k < 3; k++) {
        positions[base + v * 3 + k] =
          c.a[k] + (c.b[k] - c.a[k]) * t + c.ax[k] * ex + c.ay[k] * ey + c.az[k] * ez
      }
    }
  })
  return {
    template,
    capsuleCount: capsules.length,
    positions,
    capsuleBones: capsules.map((c) => c.bone),
    capsuleRegions: capsules.map((c) => c.region),
  }
}

/** Expanded index buffer for the whole body (for rendering). */
export function bodyMeshIndices(mesh: BodyMesh, vertexOffset = 0): Uint32Array {
  const { indices, vertexCount } = mesh.template
  const out = new Uint32Array(indices.length * mesh.capsuleCount)
  for (let c = 0; c < mesh.capsuleCount; c++) {
    const vo = vertexOffset + c * vertexCount
    const io = c * indices.length
    for (let i = 0; i < indices.length; i++) out[io + i] = indices[i] + vo
  }
  return out
}

/**
 * Authored feature curves (plan §5, step 5) expressed as template rings:
 * waistband, shorts hem, top band and hairline.
 */
export interface FeatureRing {
  bone: BoneName
  ring: RingTag
}

export function featureRingsFor(outfit: Outfit): FeatureRing[] {
  const rings: FeatureRing[] = [{ bone: 'head', ring: 'bEquator' }]
  if (outfit === 'trunks' || outfit === 'shorts') rings.push({ bone: 'pelvis', ring: 'bEquator' })
  if (outfit === 'shorts') rings.push({ bone: 'thigh.L', ring: 'mid' }, { bone: 'thigh.R', ring: 'mid' })
  if (outfit === 'bikini') rings.push({ bone: 'chest', ring: 'mid' }, { bone: 'pelvis', ring: 'bEquator' })
  if (outfit === 'swimsuit') rings.push({ bone: 'chest', ring: 'bEquator' })
  return rings
}

export const OUTFITS = ['trunks', 'shorts', 'bikini', 'swimsuit'] as const
export type Outfit = (typeof OUTFITS)[number]
