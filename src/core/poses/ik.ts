import { Matrix4, Quaternion, Vector3 } from 'three'
import type { BoneName } from '../assets/skeleton'
import type { Poser } from './poser'

/**
 * Analytic two-bone IK with a pole (swivel) direction. The middle joint is a
 * hinge about its local X axis: `hingeSign` -1 bends toward local +Z (elbow),
 * +1 bends toward local -Z (knee). Returns the distance by which the target
 * was out of reach (0 when reachable).
 */
export function solveTwoBone(
  poser: Poser,
  upper: BoneName,
  lower: BoneName,
  end: BoneName,
  target: Vector3,
  pole: Vector3,
  hingeSign: 1 | -1,
): number {
  const S = poser.position(upper)
  const L1 = Math.hypot(...poser.skeleton[poser.index.get(lower)!].offset)
  const L2 = Math.hypot(...poser.skeleton[poser.index.get(end)!].offset)
  const D = new Vector3().subVectors(target, S)
  const rawDist = D.length()
  const dist = Math.min(Math.max(rawDist, Math.abs(L1 - L2) + 1e-3), (L1 + L2) * 0.9995)
  const u = rawDist > 1e-9 ? D.clone().divideScalar(rawDist) : new Vector3(0, -1, 0)
  const cosA = Math.min(1, Math.max(-1, (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist)))
  const sinA = Math.sqrt(1 - cosA * cosA)
  const p = pole.clone().addScaledVector(u, -pole.dot(u))
  if (p.lengthSq() < 1e-8) {
    p.set(u.y, -u.x, 0)
    if (p.lengthSq() < 1e-8) p.set(0, u.z, -u.y)
  }
  p.normalize()
  const d1 = u.clone().multiplyScalar(cosA).addScaledVector(p, sinA).normalize()
  const E = S.clone().addScaledVector(d1, L1)
  const T = S.clone().addScaledVector(u, dist)
  const d2 = new Vector3().subVectors(T, E).normalize()

  // Upper bone frame: local Y = -d1, local Z along the bend direction.
  const perp = d2.clone().addScaledVector(d1, -d2.dot(d1))
  if (perp.lengthSq() < 1e-10) perp.copy(p).negate()
  perp.normalize()
  const Y = d1.clone().negate()
  const Z = perp.multiplyScalar(-hingeSign)
  const X = new Vector3().crossVectors(Y, Z).normalize()
  Z.crossVectors(X, Y).normalize()
  const worldUpper = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(X, Y, Z))
  const parentQ = poser.parentWorldQuat(upper)
  poser.setLocal(upper, parentQ.invert().multiply(worldUpper))

  const angle = Math.acos(Math.min(1, Math.max(-1, d1.dot(d2))))
  poser.setLocal(lower, new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), hingeSign * angle))
  return Math.max(0, rawDist - (L1 + L2) * 0.9995)
}

/** Rotate `bone` so its local axes match the given world basis. */
export function orientBone(poser: Poser, bone: BoneName, X: Vector3, Y: Vector3): void {
  const x = X.clone().normalize()
  const y = Y.clone().addScaledVector(x, -Y.dot(x)).normalize()
  const z = new Vector3().crossVectors(x, y)
  const world = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z))
  poser.setLocal(bone, poser.parentWorldQuat(bone).invert().multiply(world))
}
