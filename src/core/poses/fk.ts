import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import type { BodyRegion, BoneName, BoneSpec } from '../assets/skeleton'
import { DEG } from '../math/geometry'
import type { EulerDeg, JointRotations } from './types'

/**
 * One body segment proxy: an elliptical capsule, i.e. the convex hull of two
 * identical ellipsoids centred on `a` and `b`. Used for collision, support
 * and ground queries; the drawn surface is the skinned body mesh.
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

const tmpEuler = new Euler()

export function eulerToQuat(rot: EulerDeg | undefined, out = new Quaternion()): Quaternion {
  if (!rot) return out.identity()
  tmpEuler.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG, 'XYZ')
  return out.setFromEuler(tmpEuler)
}

export function quatToEuler(q: Quaternion): EulerDeg {
  tmpEuler.setFromQuaternion(q, 'XYZ')
  return [tmpEuler.x / DEG + 0, tmpEuler.y / DEG + 0, tmpEuler.z / DEG + 0]
}

/** World matrices for every bone (skeleton order), root at the origin. */
export function forwardKinematics(skeleton: BoneSpec[], root: EulerDeg, joints: JointRotations): Matrix4[] {
  const byName = new Map<BoneName, Matrix4>()
  const rootMatrix = new Matrix4().makeRotationFromQuaternion(eulerToQuat(root))
  const q = new Quaternion()
  const one = new Vector3(1, 1, 1)
  return skeleton.map((bone) => {
    const parent = bone.parent ? byName.get(bone.parent)! : rootMatrix
    const local = new Matrix4().compose(new Vector3(...bone.offset), eulerToQuat(joints[bone.name], q), one)
    const m = new Matrix4().multiplyMatrices(parent, local)
    byName.set(bone.name, m)
    return m
  })
}

/** Capsule proxies from bone matrices. */
export function capsulesFromMatrices(skeleton: BoneSpec[], matrices: Matrix4[]): Capsule[] {
  const va = new Vector3()
  const vb = new Vector3()
  const vx = new Vector3()
  const vy = new Vector3()
  const vz = new Vector3()
  return skeleton.map((bone, i) => {
    const m = matrices[i]
    const s = bone.segment
    va.set(...s.a).applyMatrix4(m)
    vb.set(...s.b).applyMatrix4(m)
    vy.subVectors(vb, va).normalize()
    vx.setFromMatrixColumn(m, 0)
    vx.addScaledVector(vy, -vx.dot(vy)).normalize()
    vz.crossVectors(vx, vy).normalize()
    const rcap = s.rcap ?? Math.min(s.rx, s.rz)
    return {
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
    }
  })
}

/** Lowest point of a capsule (exact for the elliptical hull). */
export function capsuleBottom(c: Capsule): number {
  const sup = Math.sqrt((c.rx * c.ax[1]) ** 2 + (c.rcap * c.ay[1]) ** 2 + (c.rz * c.az[1]) ** 2)
  return Math.min(c.a[1], c.b[1]) - sup
}

export interface PosedBody {
  /** Capsules in body frame: grounded (min y = 0) and centred on the origin in XZ. */
  capsules: Capsule[]
  /** Bone world matrices in the same body frame (column-major, 16 per bone). */
  matrices: Float64Array
  height: number
  reach: number
}

/**
 * Forward kinematics, then ground the body on y = 0 and centre it in XZ.
 * Pure and deterministic.
 */
export function poseBody(skeleton: BoneSpec[], root: EulerDeg, joints: JointRotations): PosedBody {
  const mats = forwardKinematics(skeleton, root, joints)
  const capsules = capsulesFromMatrices(skeleton, mats)
  let minY = Infinity
  let cx = 0
  let cz = 0
  let wsum = 0
  for (const c of capsules) {
    minY = Math.min(minY, capsuleBottom(c))
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
  const shift = new Matrix4().makeTranslation(-cx, -minY, -cz)
  const matrices = new Float64Array(mats.length * 16)
  mats.forEach((m, i) => {
    const g = new Matrix4().multiplyMatrices(shift, m)
    matrices.set(g.elements, i * 16)
  })
  return { capsules, matrices, height, reach }
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

/** Bone matrices in world space for skinning. */
export function placeMatrices(body: PosedBody, pl: Placement): Float64Array {
  const placement = new Matrix4().makeRotationY(pl.yaw).setPosition(pl.x, 0, pl.z)
  const out = new Float64Array(body.matrices.length)
  const m = new Matrix4()
  for (let i = 0; i < body.matrices.length; i += 16) {
    m.fromArray(body.matrices, i)
    m.premultiply(placement)
    out.set(m.elements, i)
  }
  return out
}
