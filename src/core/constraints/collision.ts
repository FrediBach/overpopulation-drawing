import type { BoneName } from '../assets/skeleton'
import type { Capsule } from '../poses/fk'
import { segmentSegmentDistSq } from '../math/geometry'

/**
 * Broad- and narrow-phase proxy collision for posed capsules. Proxies use the
 * conservative radius max(rx, rz, rcap) so they cover the visible surface.
 */
export interface WorldCapsule {
  personId: number
  capsule: Capsule
  min: [number, number, number]
  max: [number, number, number]
}

export function capsuleBounds(c: Capsule): { min: [number, number, number]; max: [number, number, number] } {
  const r = c.radius
  return {
    min: [Math.min(c.a[0], c.b[0]) - r, Math.min(c.a[1], c.b[1]) - r, Math.min(c.a[2], c.b[2]) - r],
    max: [Math.max(c.a[0], c.b[0]) + r, Math.max(c.a[1], c.b[1]) + r, Math.max(c.a[2], c.b[2]) + r],
  }
}

const closest = { s: 0, t: 0, cx: 0, cy: 0, cz: 0, dx: 0, dy: 0, dz: 0 }

/** Surface distance between two capsule proxies (negative when penetrating). */
export function capsuleDistance(a: Capsule, b: Capsule, out = closest): number {
  const d2 = segmentSegmentDistSq(
    a.a[0], a.a[1], a.a[2], a.b[0], a.b[1], a.b[2],
    b.a[0], b.a[1], b.a[2], b.b[0], b.b[1], b.b[2],
    out,
  )
  return Math.sqrt(d2) - a.radius - b.radius
}

/** Uniform XZ spatial hash over committed capsules. */
export class CollisionWorld {
  readonly cellSize: number
  private cells = new Map<number, number[]>()
  private items: WorldCapsule[] = []
  private stamp: Int32Array = new Int32Array(1024)
  private query = 0

  constructor(cellSize = 0.5) {
    this.cellSize = cellSize
  }

  get size(): number {
    return this.items.length
  }

  private key(ix: number, iz: number): number {
    return (ix + 32768) * 65536 + (iz + 32768)
  }

  add(personId: number, capsules: Capsule[]): void {
    for (const capsule of capsules) {
      const { min, max } = capsuleBounds(capsule)
      const index = this.items.length
      this.items.push({ personId, capsule, min, max })
      const cs = this.cellSize
      for (let ix = Math.floor(min[0] / cs); ix <= Math.floor(max[0] / cs); ix++) {
        for (let iz = Math.floor(min[2] / cs); iz <= Math.floor(max[2] / cs); iz++) {
          const k = this.key(ix, iz)
          let list = this.cells.get(k)
          if (!list) this.cells.set(k, (list = []))
          list.push(index)
        }
      }
    }
    if (this.stamp.length < this.items.length) {
      const next = new Int32Array(Math.max(this.items.length, this.stamp.length * 2))
      next.set(this.stamp)
      this.stamp = next
    }
  }

  /** Visit each committed capsule whose bounds overlap the box (each at most once). */
  forEachNear(min: readonly number[], max: readonly number[], visit: (item: WorldCapsule) => void): void {
    const q = ++this.query
    const cs = this.cellSize
    for (let ix = Math.floor(min[0] / cs); ix <= Math.floor(max[0] / cs); ix++) {
      for (let iz = Math.floor(min[2] / cs); iz <= Math.floor(max[2] / cs); iz++) {
        const list = this.cells.get(this.key(ix, iz))
        if (!list) continue
        for (const i of list) {
          if (this.stamp[i] === q) continue
          this.stamp[i] = q
          const it = this.items[i]
          if (
            it.max[0] < min[0] || it.min[0] > max[0] ||
            it.max[1] < min[1] || it.min[1] > max[1] ||
            it.max[2] < min[2] || it.min[2] > max[2]
          ) continue
          visit(it)
        }
      }
    }
  }
}

export interface ConflictSummary {
  /** Largest proxy overlap including clearance, metres (<= 0 means clear). */
  maxPenetration: number
  /** Accumulated push in XZ that would separate the candidate. */
  pushX: number
  pushZ: number
  /** Yaw change (radians) suggested by the off-centre pushes. */
  yawPush: number
  conflicts: number
  /** Candidate bones involved in conflicts (for targeted pose accommodation). */
  bones: Set<BoneName>
}

/**
 * Compare a candidate's world capsules against the committed world.
 * `centre` is the candidate's rotation centre used for the yaw suggestion.
 */
export function evaluateConflicts(
  world: CollisionWorld,
  capsules: Capsule[],
  clearance: number,
  centre: { x: number; z: number },
): ConflictSummary {
  let maxPenetration = -Infinity
  let pushX = 0
  let pushZ = 0
  let yawNum = 0
  let yawDen = 0
  let conflicts = 0
  const bones = new Set<BoneName>()
  const out = { s: 0, t: 0, cx: 0, cy: 0, cz: 0, dx: 0, dy: 0, dz: 0 }
  for (const c of capsules) {
    const { min, max } = capsuleBounds(c)
    for (let k = 0; k < 3; k++) {
      min[k] -= clearance
      max[k] += clearance
    }
    world.forEachNear(min, max, (other) => {
      const dist = capsuleDistance(c, other.capsule, out)
      const pen = clearance - dist
      if (pen > maxPenetration) maxPenetration = pen
      if (pen <= 0) return
      conflicts++
      bones.add(c.bone)
      let nx = out.dx
      let nz = out.dz
      let nl = Math.hypot(nx, nz)
      if (nl < 1e-6) {
        // Vertically stacked or coincident axes: push away from the other segment's midpoint.
        nx = out.cx - (other.capsule.a[0] + other.capsule.b[0]) / 2
        nz = out.cz - (other.capsule.a[2] + other.capsule.b[2]) / 2
        nl = Math.hypot(nx, nz)
        if (nl < 1e-6) {
          nx = out.cx - centre.x
          nz = out.cz - centre.z
          nl = Math.hypot(nx, nz) || 1
        }
      }
      const fx = (nx / nl) * pen
      const fz = (nz / nl) * pen
      pushX += fx
      pushZ += fz
      const rx = out.cx - centre.x
      const rz = out.cz - centre.z
      yawNum += fx * rz - fz * rx
      yawDen += rx * rx + rz * rz
    })
  }
  return {
    maxPenetration: maxPenetration === -Infinity ? -1 : maxPenetration,
    pushX,
    pushZ,
    yawPush: yawDen > 1e-9 ? yawNum / yawDen : 0,
    conflicts,
    bones,
  }
}
