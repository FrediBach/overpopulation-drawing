import { placeCapsules, type Capsule, type Placement, type PosedBody } from '../poses/fk'
import { evaluateConflicts, type CollisionWorld } from '../constraints/collision'
import { clamp } from '../math/geometry'

export interface FitOptions {
  clearance: number
  maxIterations: number
  /** Maximum distance from the anchor the root may move while fitting. */
  maxDrift: number
  /** Maximum yaw change from the initial yaw, radians. */
  maxYawDrift: number
}

export interface FitResult {
  ok: boolean
  placement: Placement
  capsules: Capsule[]
  maxPenetration: number
  iterations: number
}

/**
 * Bounded, damped root fitting (plan §7 Stage B): translate and yaw the
 * candidate to resolve proxy conflicts. Bone lengths and pose are fixed here;
 * limb accommodation happens by switching to an alternate pose variant.
 * Non-penetration is an acceptance constraint, never a weighted cost.
 */
export function fitRoot(world: CollisionWorld, body: PosedBody, start: Placement, opts: FitOptions): FitResult {
  const pl: Placement = { ...start }
  let capsules = placeCapsules(body, pl)
  let summary = evaluateConflicts(world, capsules, opts.clearance, pl)
  let it = 0
  while (summary.maxPenetration > 0 && it < opts.maxIterations) {
    it++
    const step = 0.85
    let mx = summary.pushX * step
    let mz = summary.pushZ * step
    const ml = Math.hypot(mx, mz)
    const maxStep = 0.18
    if (ml > maxStep) {
      mx *= maxStep / ml
      mz *= maxStep / ml
    } else if (ml < 0.004) {
      // Nudge out of near-equilibrium where pushes cancel.
      const s = 0.004 / (ml || 1)
      mx = ml ? mx * s : 0.004
      mz = ml ? mz * s : 0
    }
    pl.x += mx
    pl.z += mz
    pl.yaw += clamp(summary.yawPush * 0.6, -0.12, 0.12)
    if (Math.hypot(pl.x - start.x, pl.z - start.z) > opts.maxDrift) break
    if (Math.abs(pl.yaw - start.yaw) > opts.maxYawDrift) break
    capsules = placeCapsules(body, pl)
    summary = evaluateConflicts(world, capsules, opts.clearance, pl)
  }
  return {
    ok: summary.maxPenetration <= 0,
    placement: pl,
    capsules,
    maxPenetration: summary.maxPenetration,
    iterations: it,
  }
}
