import type { BoneName } from '../assets/skeleton'
import type { BodyAsset } from './asset'

export const OUTFITS = ['trunks', 'shorts', 'bikini', 'swimsuit'] as const
export type Outfit = (typeof OUTFITS)[number]

/**
 * Authored feature curves as level sets of rest-pose scalar fields (plan §5,
 * step 5): the zero crossing of each field on the skinned surface becomes a
 * line that follows the body through any pose.
 */
export interface FeatureField {
  id: string
  /** Per-vertex scalar; the curve is where it crosses zero. */
  scalar: Float32Array
  /** Per-vertex flag: faces are used only when all three vertices are masked. */
  mask: Uint8Array
}

interface FeatureDef {
  id: string
  bones: BoneName[]
  level: (x: number, y: number, z: number) => number
}

function defs(asset: BodyAsset, outfit: Outfit): FeatureDef[] {
  const H = asset.params.height
  const hs = 1 + 0.38 * asset.params.child
  const J = asset.restJoints
  const pelvisY = J.pelvis[1]
  const hipY = J['thigh.L'][1]
  const chestY = J.chest[1]
  const headY = J.head[1]
  const thighs: BoneName[] = ['thigh.L', 'thigh.R']
  const out: FeatureDef[] = [
    {
      id: 'hairline',
      bones: ['head'],
      level: (_x, y, z) => y - (headY + H * hs * (0.07 + 0.065 * Math.tanh((z - 0.02 * H) / (0.025 * H)))),
    },
  ]
  const waist = (h: number): FeatureDef => ({ id: 'waist', bones: ['pelvis', 'spine'], level: (_x, y) => y - (pelvisY + h * H) })
  const highCut: FeatureDef = {
    id: 'legline',
    bones: ['pelvis', ...thighs],
    level: (x, y) => y - (hipY - 0.055 * H + 0.9 * Math.max(0, Math.abs(x) - 0.05 * H)),
  }
  switch (outfit) {
    case 'trunks':
      out.push(waist(0.085), { id: 'hem', bones: ['pelvis', ...thighs], level: (_x, y) => y - (hipY - 0.09 * H) })
      break
    case 'shorts':
      out.push(waist(0.08), { id: 'hem', bones: thighs, level: (_x, y) => y - (hipY - 0.22 * H) })
      break
    case 'bikini':
      out.push(waist(0.03), highCut, { id: 'top', bones: ['chest'], level: (_x, y) => y - (chestY + 0.075 * H) })
      break
    case 'swimsuit':
      out.push(highCut, {
        id: 'neckline',
        bones: ['chest'],
        level: (_x, y, z) => y - (chestY + 0.2 * H - 1.2 * Math.max(0, z)),
      })
      break
  }
  return out
}

const cache = new Map<string, FeatureField[]>()

export function featureFields(asset: BodyAsset, outfit: Outfit): FeatureField[] {
  const key = `${asset.key}/${outfit}`
  let fields = cache.get(key)
  if (fields) return fields
  const n = asset.restPositions.length / 3
  const boneIndex = new Map(asset.skeleton.map((b, i) => [b.name, i]))
  fields = defs(asset, outfit).map((def) => {
    const scalar = new Float32Array(n)
    const mask = new Uint8Array(n)
    const allowed = new Set(def.bones.map((b) => boneIndex.get(b)!))
    for (let v = 0; v < n; v++) {
      const p = asset.restPositions
      scalar[v] = def.level(p[v * 3], p[v * 3 + 1], p[v * 3 + 2])
      // Avoid exact zeros so every crossing is well defined.
      if (scalar[v] === 0) scalar[v] = 1e-7
      mask[v] = allowed.has(asset.dominantBone[v]) ? 1 : 0
    }
    return { id: def.id, scalar, mask }
  })
  cache.set(key, fields)
  return fields
}
