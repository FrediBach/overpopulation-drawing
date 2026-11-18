import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { type BodyRegion, type BoneName } from '../assets/skeleton'
import { buildVariantSkeleton, type BodyVariant } from '../assets/bodyVariants'
import { DEG } from '../math/geometry'
import type { EulerDeg, JointRotations } from './types'

/**
 * One body segment in a posed frame: an elliptical capsule, i.e. the convex
 * hull of two identical ellipsoids centred on `a` and `b`.
 * Basis vectors: `ax` (cross-section X), `ay` (segment axis), `az` (cross-section Z).
 */
export interface Capsule {
  bone: BoneName
  region: BodyRegion
  a: [number, number, number]
  b: [number, number, number]
  ax: [number, number, number]
  ay: [number, number, number]
  az: [number, number, number]
  rx: number
  rz: number
  rcap: number
  /** Conservative radius for proxy collision queries. */
  radius: number
}

export interface PosedBody {
  /** Capsules in body frame: grounded (min y = 0) and centred on the origin in XZ. */
  capsules: Capsule[]
  /** Highest point above ground, in metres. */
  height: number
  /** Horizontal radius of the body around its centre. */
  reach: number
}

const tmpEuler = new Euler()
const tmpQuat = new Quaternion()

function eulerQuat(rot: EulerDeg | undefined, out: Quaternion): Quaternion {
  if (!rot) return out.identity()
  tmpEuler.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG, 'XYZ')
  return out.setFromEuler(tmpEuler)
}

/** Vertical half-extent of an ellipsoid with the given axes and radii. */
function verticalSupport(c: Capsule): number {
  return Math.sqrt((c.rx * c.ax[1]) ** 2 + (c.rcap * c.ay[1]) ** 2 + (c.rz * c.az[1]) ** 2)
}

/**
 * Forward kinematics: evaluate the body variant in a pose, then ground it
 * on y = 0 and centre it. Pure and deterministic.
 */
export function poseBody(variant: BodyVariant, root: EulerDeg, joints: JointRotations): PosedBody {
  const skeleton = buildVariantSkeleton(variant)
  const world = new Map<BoneName, Matrix4>()
  const local = new Matrix4()
  const capsules: Capsule[] = []
  const rootMatrix = new Matrix4().makeRotationFromQuaternion(eulerQuat(root, new Quaternion()))

  const va = new Vector3()
  const vb = new Vector3()
  const vx = new Vector3()
  const vy = new Vector3()
  const vz = new Vector3()

  for (const bone of skeleton) {
    const parent = bone.parent ? world.get(bone.parent)! : rootMatrix
    local.compose(
      new Vector3(...bone.offset),
      eulerQuat(joints[bone.name], tmpQuat),
      new Vector3(1, 1, 1),
    )
    const m = new Matrix4().multiplyMatrices(parent, local)
    world.set(bone.name, m)

    const s = bone.segment
    va.set(...s.a).applyMatrix4(m)
    vb.set(...s.b).applyMatrix4(m)
    vy.subVectors(vb, va).normalize()
    vx.setFromMatrixColumn(m, 0)
    vx.addScaledVector(vy, -vx.dot(vy)).normalize()
    vz.crossVectors(vx, vy).normalize()
    const rcap = s.rcap ?? Math.min(s.rx, s.rz)
    capsules.push({
      bone: bone.name,
      region: bone.region,
      a: va.toArray() as [number, number, number],
      b: vb.toArray() as [number, number, number],
      ax: vx.toArray() as [number, number, number],
      ay: vy.toArray() as [number, number, number],
      az: vz.toArray() as [number, number, number],
      rx: s.rx,
      rz: s.rz,
      rcap,
      radius: Math.max(s.rx, s.rz, rcap),
    })
  }

  // Ground: lowest surface point touches y = 0.
  let minY = Infinity
  let cx = 0
  let cz = 0
  let wsum = 0
  for (const c of capsules) {
    const sup = verticalSupport(c)
    minY = Math.min(minY, c.a[1] - sup, c.b[1] - sup)
    const len = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1], c.b[2] - c.a[2]) + c.radius
    const w = len * c.radius
    cx += ((c.a[0] + c.b[0]) / 2) * w
    cz += ((c.a[2] + c.b[2]) / 2) * w
    wsum += w
  }
  cx /= wsum
  cz /= wsum
  let height = 0
  let reach = 0
  for (const c of capsules) {
    for (const p of [c.a, c.b]) {
      p[0] -= cx
      p[1] -= minY
      p[2] -= cz
      height = Math.max(height, p[1] + c.radius)
      reach = Math.max(reach, Math.hypot(p[0], p[2]) + c.radius)
    }
  }
  return { capsules, height, reach }
}

/** Placement of a posed body on the beach: rotate about Y, then translate in XZ. */
export interface Placement {
  x: number
  z: number
  yaw: number
}

function place(p: [number, number, number], cos: number, sin: number, pl: Placement, translate: boolean): [number, number, number] {
  const x = p[0] * cos + p[2] * sin
  const z = -p[0] * sin + p[2] * cos
  return translate ? [x + pl.x, p[1], z + pl.z] : [x, p[1], z]
}

/** Transform body-frame capsules into world space. */
export function placeCapsules(body: PosedBody, pl: Placement): Capsule[] {
  const cos = Math.cos(pl.yaw)
  const sin = Math.sin(pl.yaw)
  return body.capsules.map((c) => ({
    ...c,
    a: place(c.a, cos, sin, pl, true),
    b: place(c.b, cos, sin, pl, true),
    ax: place(c.ax, cos, sin, pl, false),
    ay: place(c.ay, cos, sin, pl, false),
    az: place(c.az, cos, sin, pl, false),
  }))
}

