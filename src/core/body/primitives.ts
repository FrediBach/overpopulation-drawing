import { Matrix4, Vector3 } from 'three'
import type { BoneName, BoneSpec } from '../assets/skeleton'
import { forwardKinematics } from '../poses/fk'
import type { BodyParams } from './params'
import { REST_POSE } from './skeleton'

/** Limb groups. The trunk is smoothly blended with each limb, limbs only hard-unioned with each other. */
export const PARTS = ['trunk', 'armL', 'armR', 'legL', 'legR'] as const
export type Part = (typeof PARTS)[number]

type V3 = [number, number, number]

interface LocalCone {
  kind: 'cone'
  bone: BoneName
  a: V3
  b: V3
  r1: number
  r2: number
  k: number
}

interface LocalEllipsoid {
  kind: 'ellipsoid'
  bone: BoneName
  c: V3
  r: V3
  k: number
}

type LocalPrim = LocalCone | LocalEllipsoid

/** A primitive in rest-pose world space, ready for field evaluation. */
export interface Primitive {
  kind: 'cone' | 'ellipsoid'
  bone: BoneName
  boneIndex: number
  part: Part
  /** Smooth-min blend radius, metres. */
  k: number
  // cone
  a: V3
  b: V3
  r1: number
  r2: number
  // ellipsoid: centre, radii and world→local rotation (row-major 3x3)
  c: V3
  r: V3
  rot: number[]
  min: V3
  max: V3
}

function partOf(bone: BoneName): Part {
  if (/^(upperArm|foreArm|hand)\.L$/.test(bone)) return 'armL'
  if (/^(upperArm|foreArm|hand)\.R$/.test(bone)) return 'armR'
  if (/^(thigh|shin|foot)\.L$/.test(bone)) return 'legL'
  if (/^(thigh|shin|foot)\.R$/.test(bone)) return 'legR'
  return 'trunk'
}

/**
 * Anatomical masses, authored for the left side in bone-local metres for the
 * reference adult and modulated by the body parameters.
 */
function localPrimitives(p: BodyParams): LocalPrim[] {
  const f = p.mass
  const m = p.muscle
  const w = p.femininity
  const prims: LocalPrim[] = []
  const E = (bone: BoneName, c: V3, r: V3, k: number) => prims.push({ kind: 'ellipsoid', bone, c, r, k })
  const C = (bone: BoneName, a: V3, b: V3, r1: number, r2: number, k: number) => prims.push({ kind: 'cone', bone, a, b, r1, r2, k })
  const both = (fn: (s: 1 | -1, side: 'L' | 'R') => void) => {
    fn(1, 'L')
    fn(-1, 'R')
  }

  // Pelvis and hips.
  E('pelvis', [0, 0.03, -0.005], [0.135 + 0.035 * w + 0.05 * f, 0.1, 0.09 + 0.04 * f], 0.05)
  both((s) => E('pelvis', [0.065 * s, -0.015, -0.05 - 0.01 * w], [0.072 + 0.015 * w + 0.03 * f, 0.085 + 0.01 * f, 0.062 + 0.02 * w + 0.03 * f], 0.04))
  E('pelvis', [0, 0.07, 0.03], [0.115 + 0.04 * f, 0.07 + 0.02 * f, 0.06 + 0.08 * f], 0.05)
  // Abdomen.
  E('spine', [0, 0.08, 0], [0.12 + 0.06 * f - 0.015 * w, 0.11, 0.082 + 0.05 * f], 0.05)
  E('spine', [0, 0.04, 0.025 + 0.03 * f], [0.105 + 0.04 * f, 0.1 + 0.02 * f, 0.045 + 0.1 * f], 0.06)
  // Chest, shoulders, back.
  E('chest', [0, 0.12, -0.005], [0.14 + 0.02 * m + 0.035 * f - 0.012 * w, 0.15, 0.092 + 0.03 * f], 0.05)
  E('chest', [0, 0.17, -0.04], [0.125 + 0.02 * m, 0.1, 0.07], 0.05)
  both((s) => {
    E('chest', [0.07 * s, 0.11 - 0.025 * w, 0.055 + 0.02 * w], [0.058 + 0.02 * w + 0.025 * f + 0.01 * m, 0.055 + 0.02 * w, 0.03 + 0.05 * w * w + 0.02 * f], 0.04)
    E('chest', [(0.16 + 0.01 * m) * s, 0.2, -0.005], [0.052 + 0.015 * m + 0.01 * f, 0.055, 0.052 + 0.01 * m], 0.045)
    C('chest', [0.1 * s, 0.21, -0.025], [0.03 * s, 0.27, -0.02], 0.048 + 0.01 * m, 0.044, 0.04)
  })
  // Neck and head.
  C('neck', [0, -0.03, 0], [0, 0.09, 0.01], 0.058 + 0.01 * m + 0.015 * f, 0.048, 0.04)
  const hs = 1 + 0.38 * p.child
  E('head', [0, 0.115 * hs, -0.01], [0.072 * hs, 0.09 * hs, 0.092 * hs], 0.03)
  E('head', [0, 0.065 * hs, 0.03 * hs], [0.057 * hs, 0.068 * hs, 0.06 * hs], 0.03)
  E('head', [0, 0.03 * hs, 0.045 * hs], [0.043 * hs, 0.03 * hs, 0.04 * hs], 0.025)
  C('head', [0, 0.087 * hs, 0.088 * hs], [0, 0.062 * hs, 0.103 * hs], 0.009, 0.014, 0.012)

  both((_s, side) => {
    const ua = `upperArm.${side}` as BoneName
    const fa = `foreArm.${side}` as BoneName
    const hd = `hand.${side}` as BoneName
    const th = `thigh.${side}` as BoneName
    const sh = `shin.${side}` as BoneName
    const ft = `foot.${side}` as BoneName
    // Arm.
    C(ua, [0, 0.01, 0], [0, -0.27, 0], 0.046 + 0.012 * m + 0.025 * f - 0.005 * w, 0.036 + 0.008 * m + 0.012 * f, 0.03)
    E(ua, [0, -0.12, 0.012], [0.036 + 0.008 * f, 0.08, 0.036 + 0.012 * m + 0.008 * f], 0.03)
    E(ua, [0, -0.11, -0.014], [0.034 + 0.01 * f, 0.085, 0.032 + 0.008 * m + 0.006 * f], 0.03)
    C(fa, [0, 0, 0], [0, -0.24, 0], 0.039 + 0.008 * m + 0.012 * f, 0.025 + 0.004 * f, 0.025)
    E(fa, [0, -0.065, 0], [0.04 + 0.008 * m + 0.01 * f, 0.07, 0.036], 0.025)
    // Hand: fingers along -Y, palm facing the body in the rest pose, thumb forward.
    E(hd, [0, -0.055, 0.003], [0.019, 0.05, 0.042], 0.015)
    C(hd, [0, -0.085, 0.016], [0, -0.16, 0.018], 0.016, 0.012, 0.012)
    C(hd, [0, -0.085, -0.014], [0, -0.155, -0.012], 0.016, 0.011, 0.012)
    C(hd, [0, -0.03, 0.035], [0.004, -0.08, 0.058], 0.014, 0.011, 0.012)
    // Leg.
    C(th, [0, 0.02, 0], [0, -0.41, 0], 0.078 + 0.035 * f + 0.015 * m + 0.015 * w, 0.051 + 0.01 * f + 0.006 * m, 0.04)
    E(th, [0.008, -0.16, 0.012], [0.068 + 0.03 * f + 0.01 * w, 0.15, 0.063 + 0.025 * f + 0.012 * m], 0.04)
    E(th, [0, -0.4, 0.015], [0.046, 0.05, 0.044], 0.03)
    C(sh, [0, -0.02, 0], [0, -0.39, 0], 0.046 + 0.01 * f, 0.029, 0.03)
    E(sh, [0, -0.12, -0.027], [0.041 + 0.01 * m + 0.016 * f, 0.1, 0.042 + 0.01 * m + 0.015 * f], 0.035)
    // Foot: points along +Z.
    C(ft, [0, 0.02, 0], [0, -0.03, 0], 0.029, 0.033, 0.02)
    E(ft, [0, -0.035, -0.015], [0.03, 0.034, 0.04], 0.02)
    E(ft, [0, -0.05, 0.065], [0.038, 0.027, 0.094], 0.025)
    E(ft, [0, -0.058, 0.145], [0.037, 0.018, 0.035], 0.02)
  })

  // Mirror authored left-side x coordinates for right-side limb bones.
  for (const prim of prims) {
    if (!prim.bone.endsWith('.R')) continue
    if (prim.kind === 'cone') {
      prim.a = [-prim.a[0], prim.a[1], prim.a[2]]
      prim.b = [-prim.b[0], prim.b[1], prim.b[2]]
    } else {
      prim.c = [-prim.c[0], prim.c[1], prim.c[2]]
    }
  }
  return prims
}

/** Primitives positioned in the rest pose (A-pose, root at origin). */
export function restPrimitives(skeleton: BoneSpec[], params: BodyParams): { prims: Primitive[]; restMatrices: Matrix4[] } {
  const restMatrices = forwardKinematics(skeleton, [0, 0, 0], REST_POSE)
  const index = new Map(skeleton.map((b, i) => [b.name, i]))
  // Scale: limbs follow the skeleton's limb scale, trunk the overall height.
  const h = params.height
  const limbScale = h * (1 - 0.1 * params.child)
  const v = new Vector3()
  const prims = localPrimitives(params).map((lp): Primitive => {
    const bi = index.get(lp.bone)!
    const m = restMatrices[bi]
    const s = partOf(lp.bone) === 'trunk' ? h : limbScale
    const toWorld = (p: V3): V3 => v.set(p[0] * s, p[1] * s, p[2] * s).applyMatrix4(m).toArray() as V3
    const e = m.elements
    // world→local rotation = transpose of the bone's rotation (rigid, unscaled).
    const rot = [e[0], e[1], e[2], e[4], e[5], e[6], e[8], e[9], e[10]]
    if (lp.kind === 'cone') {
      const a = toWorld(lp.a)
      const b = toWorld(lp.b)
      const r1 = lp.r1 * s
      const r2 = lp.r2 * s
      const r = Math.max(r1, r2)
      return {
        kind: 'cone', bone: lp.bone, boneIndex: bi, part: partOf(lp.bone), k: lp.k * s,
        a, b, r1, r2, c: [0, 0, 0], r: [0, 0, 0], rot,
        min: [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.min(a[2], b[2]) - r],
        max: [Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, Math.max(a[2], b[2]) + r],
      }
    }
    const c = toWorld(lp.c)
    const r: V3 = [lp.r[0] * s, lp.r[1] * s, lp.r[2] * s]
    const R = Math.max(...r)
    return {
      kind: 'ellipsoid', bone: lp.bone, boneIndex: bi, part: partOf(lp.bone), k: lp.k * s,
      a: [0, 0, 0], b: [0, 0, 0], r1: 0, r2: 0, c, r, rot,
      min: [c[0] - R, c[1] - R, c[2] - R],
      max: [c[0] + R, c[1] + R, c[2] + R],
    }
  })
  return { prims, restMatrices }
}
