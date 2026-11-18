import { surfaceNets, type TriMesh } from '../mesh/surfaceNets'
import { PARTS, type Part, type Primitive } from './primitives'

/** Inigo Quilez's round cone distance. */
function sdRoundCone(px: number, py: number, pz: number, p: Primitive): number {
  const [ax, ay, az] = p.a
  const bax = p.b[0] - ax, bay = p.b[1] - ay, baz = p.b[2] - az
  const l2 = bax * bax + bay * bay + baz * baz
  const rr = p.r1 - p.r2
  const a2 = l2 - rr * rr
  const il2 = 1 / l2
  const pax = px - ax, pay = py - ay, paz = pz - az
  const y = pax * bax + pay * bay + paz * baz
  const z = y - l2
  const qx = pax * l2 - bax * y, qy = pay * l2 - bay * y, qz = paz * l2 - baz * y
  const x2 = qx * qx + qy * qy + qz * qz
  const y2 = y * y * l2
  const z2 = z * z * l2
  const k = Math.sign(rr) * rr * rr * x2
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - p.r2
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - p.r1
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - p.r1
}

/** Approximate ellipsoid distance (bound-corrected, IQ). */
function sdEllipsoid(px: number, py: number, pz: number, p: Primitive): number {
  const dx = px - p.c[0], dy = py - p.c[1], dz = pz - p.c[2]
  const R = p.rot
  const lx = R[0] * dx + R[1] * dy + R[2] * dz
  const ly = R[3] * dx + R[4] * dy + R[5] * dz
  const lz = R[6] * dx + R[7] * dy + R[8] * dz
  const k0 = Math.hypot(lx / p.r[0], ly / p.r[1], lz / p.r[2])
  const k1 = Math.hypot(lx / (p.r[0] * p.r[0]), ly / (p.r[1] * p.r[1]), lz / (p.r[2] * p.r[2]))
  if (k1 < 1e-9) return -Math.min(p.r[0], p.r[1], p.r[2])
  return (k0 * (k0 - 1)) / k1
}

export function primitiveDistance(px: number, py: number, pz: number, p: Primitive): number {
  return p.kind === 'cone' ? sdRoundCone(px, py, pz, p) : sdEllipsoid(px, py, pz, p)
}

/** Polynomial smooth minimum. */
export function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}

const FAR = 1
/** Limb-to-trunk blend radius at shoulders and hips (relative to body scale via prim k). */
const ATTACH_K = 0.035

export interface FieldSample {
  d: number
  /** Index into PARTS of the dominating group. */
  part: number
}

/**
 * Body field: each group is a smooth union of its primitives; every limb is
 * smoothly attached to the trunk, while limbs are only hard-unioned with each
 * other, so touching thighs or an arm against the side never fuse.
 */
export class BodyField {
  private groups: Primitive[][]
  readonly bounds: { min: [number, number, number]; max: [number, number, number] }
  private margin: number

  constructor(readonly prims: Primitive[]) {
    this.groups = PARTS.map((part) => prims.filter((p) => p.part === part))
    const min: [number, number, number] = [Infinity, Infinity, Infinity]
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
    let maxK = 0
    for (const p of prims) {
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], p.min[i])
        max[i] = Math.max(max[i], p.max[i])
      }
      maxK = Math.max(maxK, p.k)
    }
    this.bounds = { min, max }
    this.margin = maxK + ATTACH_K + 0.02
  }

  private group(g: number, x: number, y: number, z: number): number {
    let acc = FAR
    const m = this.margin
    for (const p of this.groups[g]) {
      if (x < p.min[0] - m || x > p.max[0] + m || y < p.min[1] - m || y > p.max[1] + m || z < p.min[2] - m || z > p.max[2] + m) continue
      acc = smin(acc, primitiveDistance(x, y, z, p), p.k)
    }
    return acc
  }

  sample(x: number, y: number, z: number, out?: FieldSample): number {
    const t = this.group(0, x, y, z)
    let d = t
    let part = 0
    let bestLimb = FAR
    for (let g = 1; g < PARTS.length; g++) {
      const l = this.group(g, x, y, z)
      if (l >= FAR) continue
      const v = smin(t, l, ATTACH_K)
      if (v < d) d = v
      if (l < bestLimb) {
        bestLimb = l
        if (l < t + ATTACH_K * 0.5) part = g
      }
    }
    if (out) {
      out.d = d
      out.part = part
    }
    return d
  }

  gradient(x: number, y: number, z: number, h: number): [number, number, number] {
    return [
      (this.sample(x + h, y, z) - this.sample(x - h, y, z)) / (2 * h),
      (this.sample(x, y + h, z) - this.sample(x, y - h, z)) / (2 * h),
      (this.sample(x, y, z + h) - this.sample(x, y, z - h)) / (2 * h),
    ]
  }

  /** Polygonise at the given cell size and project vertices onto the iso-surface. */
  polygonize(cell: number): TriMesh {
    const pad = 2 * cell + 0.02
    const origin: [number, number, number] = [this.bounds.min[0] - pad, this.bounds.min[1] - pad, this.bounds.min[2] - pad]
    const dims: [number, number, number] = [0, 1, 2].map(
      (i) => Math.ceil((this.bounds.max[i] - this.bounds.min[i] + 2 * pad) / cell) + 1,
    ) as [number, number, number]
    const [nx, ny, nz] = dims
    const values = new Float32Array(nx * ny * nz)
    let n = 0
    for (let k = 0; k < nz; k++) {
      const z = origin[2] + k * cell
      for (let j = 0; j < ny; j++) {
        const y = origin[1] + j * cell
        for (let i = 0; i < nx; i++) values[n++] = this.sample(origin[0] + i * cell, y, z)
      }
    }
    const mesh = surfaceNets(values, { origin, cell, dims })
    // Newton projection onto the surface removes grid stair-stepping.
    const p = mesh.positions
    const gh = cell * 0.25
    for (let v = 0; v < p.length; v += 3) {
      for (let it = 0; it < 2; it++) {
        const d = this.sample(p[v], p[v + 1], p[v + 2])
        const g = this.gradient(p[v], p[v + 1], p[v + 2], gh)
        const g2 = g[0] * g[0] + g[1] * g[1] + g[2] * g[2]
        if (g2 < 1e-8) break
        const s = Math.max(-cell * 0.6, Math.min(cell * 0.6, d / g2))
        p[v] -= g[0] * s
        p[v + 1] -= g[1] * s
        p[v + 2] -= g[2] * s
      }
    }
    return mesh
  }
}

export type { Part }
