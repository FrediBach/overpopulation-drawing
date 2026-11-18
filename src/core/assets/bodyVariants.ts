import { REFERENCE_SKELETON, type BoneSpec } from './skeleton'

/**
 * Body variants: proportional changes that stay readable in outline.
 * Bodies are never rescaled during packing (see plan §5); a variant is
 * chosen once and kept.
 */
export interface BodyVariant {
  id: string
  label: string
  /** Uniform height scale applied to bone offsets and segment lengths. */
  height: number
  /** Girth multiplier for torso cross-sections. */
  torsoGirth: number
  /** Girth multiplier for limb cross-sections. */
  limbGirth: number
  /** Shoulder-width multiplier. */
  shoulders: number
  /** Hip-width multiplier. */
  hips: number
}

export const BODY_VARIANTS: readonly BodyVariant[] = [
  { id: 'avg-a', label: 'Average', height: 1.0, torsoGirth: 1.0, limbGirth: 1.0, shoulders: 1.0, hips: 1.0 },
  { id: 'tall-slim', label: 'Tall, slim', height: 1.07, torsoGirth: 0.88, limbGirth: 0.88, shoulders: 1.0, hips: 0.92 },
  { id: 'broad', label: 'Broad', height: 1.03, torsoGirth: 1.12, limbGirth: 1.12, shoulders: 1.14, hips: 1.0 },
  { id: 'heavy', label: 'Heavy', height: 0.98, torsoGirth: 1.35, limbGirth: 1.22, shoulders: 1.05, hips: 1.18 },
  { id: 'petite', label: 'Petite', height: 0.92, torsoGirth: 0.92, limbGirth: 0.9, shoulders: 0.9, hips: 1.05 },
  { id: 'curvy', label: 'Curvy', height: 0.95, torsoGirth: 1.05, limbGirth: 1.05, shoulders: 0.94, hips: 1.2 },
  { id: 'child', label: 'Child', height: 0.7, torsoGirth: 0.85, limbGirth: 0.85, shoulders: 0.85, hips: 0.88 },
]

export const BODY_VARIANT_BY_ID: Record<string, BodyVariant> = Object.fromEntries(
  BODY_VARIANTS.map((v) => [v.id, v]),
)

const TORSO = new Set(['pelvis', 'spine', 'chest'])

/** Apply a variant to the reference skeleton, returning a new bone table. */
export function buildVariantSkeleton(variant: BodyVariant): BoneSpec[] {
  const h = variant.height
  return REFERENCE_SKELETON.map((bone) => {
    const torso = TORSO.has(bone.name)
    const girth = torso ? variant.torsoGirth : bone.name === 'head' || bone.name === 'neck' ? 1 : variant.limbGirth
    let ox = bone.offset[0] * h
    if (bone.name.startsWith('upperArm')) ox = bone.offset[0] * variant.shoulders * h
    if (bone.name.startsWith('thigh')) ox = bone.offset[0] * variant.hips * h
    // Children have proportionally larger heads.
    const headScale = bone.name === 'head' ? Math.pow(h, -0.35) : 1
    let rx = bone.segment.rx * girth * h * headScale
    if (bone.name === 'pelvis') rx *= variant.hips
    if (bone.name === 'chest') rx *= variant.shoulders
    const s = bone.segment
    return {
      ...bone,
      offset: [ox, bone.offset[1] * h, bone.offset[2] * h],
      segment: {
        a: [s.a[0] * h, s.a[1] * h * headScale, s.a[2] * h],
        b: [s.b[0] * h, s.b[1] * h * headScale, s.b[2] * h],
        rx,
        rz: s.rz * girth * h * headScale,
        rcap: s.rcap !== undefined ? s.rcap * girth * h * headScale : undefined,
      },
    }
  })
}
