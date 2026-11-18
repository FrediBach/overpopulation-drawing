import { Matrix4, Vector3 } from 'three'
import { BONE_NAMES, type BoneName, type BoneSpec } from '../assets/skeleton'
import { buildTopology, type MeshTopology } from '../mesh/topology'
import { BodyField, primitiveDistance, type FieldSample } from './field'
import { bodyKey, type BodyParams } from './params'
import { PARTS, restPrimitives } from './primitives'
import { buildSkeleton } from './skeleton'

/** Polygonisation cell sizes (metres, reference adult). */
export const PREVIEW_CELL = 0.024
export const EXPORT_CELL = 0.016

/**
 * A rigged organic body: rest-pose surface, skin weights and topology,
 * built once per body shape and resolution and shared by every person who
 * uses it (plan §5: "build surface adjacency once per asset").
 */
export interface BodyAsset {
  key: string
  params: BodyParams
  cell: number
  /** Skeleton with collision capsules fitted to this surface. */
  skeleton: BoneSpec[]
  /** Inverse rest bone matrices (column-major, 16 per bone). */
  restInverse: Float64Array
  restPositions: Float32Array
  indices: Uint32Array
  topology: MeshTopology
  /** Four influences per vertex. */
  joints: Uint8Array
  weights: Float32Array
  /** Bone index with the largest weight, per vertex. */
  dominantBone: Uint8Array
  /** Rest-pose joint positions (for feature levels). */
  restJoints: Record<BoneName, [number, number, number]>
}

const ALLOWED: Record<(typeof PARTS)[number], BoneName[]> = {
  trunk: ['pelvis', 'spine', 'chest', 'neck', 'head', 'upperArm.L', 'upperArm.R', 'thigh.L', 'thigh.R'],
  armL: ['chest', 'upperArm.L', 'foreArm.L', 'hand.L'],
  armR: ['chest', 'upperArm.R', 'foreArm.R', 'hand.R'],
  legL: ['pelvis', 'thigh.L', 'shin.L', 'foot.L'],
  legR: ['pelvis', 'thigh.R', 'shin.R', 'foot.R'],
}

const cache = new Map<string, BodyAsset>()

export function getBodyAsset(params: BodyParams, cell: number): BodyAsset {
  const key = `${bodyKey(params)}@${cell}`
  let asset = cache.get(key)
  if (!asset) {
    asset = buildBodyAsset(params, cell)
    cache.set(key, asset)
  }
  return asset
}

/** Fitted skeleton for collisions and posing (from the preview-resolution surface). */
export function getBodySkeleton(params: BodyParams): BoneSpec[] {
  return getBodyAsset(params, PREVIEW_CELL).skeleton
}

export function clearBodyCache(): void {
  cache.clear()
}

function buildBodyAsset(params: BodyParams, cellRef: number): BodyAsset {
  const baseSkeleton = buildSkeleton(params)
  const { prims, restMatrices } = restPrimitives(baseSkeleton, params)
  const field = new BodyField(prims)
  const cell = cellRef * Math.max(0.75, params.height)
  const mesh = field.polygonize(cell)
  const n = mesh.positions.length / 3
  const boneIndex = new Map(BONE_NAMES.map((b, i) => [b, i]))
  const byBone = BONE_NAMES.map((name) => prims.filter((p) => p.bone === name))

  // Skin weights from distance to each allowed bone's primitives.
  const joints = new Uint8Array(n * 4)
  const weights = new Float32Array(n * 4)
  const dominantBone = new Uint8Array(n)
  const sample: FieldSample = { d: 0, part: 0 }
  const sigma = 0.016 * params.height
  const cand: { b: number; d: number }[] = []
  for (let v = 0; v < n; v++) {
    const x = mesh.positions[v * 3], y = mesh.positions[v * 3 + 1], z = mesh.positions[v * 3 + 2]
    field.sample(x, y, z, sample)
    cand.length = 0
    let dmin = Infinity
    for (const name of ALLOWED[PARTS[sample.part]]) {
      const bi = boneIndex.get(name)!
      let d = Infinity
      for (const p of byBone[bi]) d = Math.min(d, primitiveDistance(x, y, z, p))
      if (d === Infinity) continue
      cand.push({ b: bi, d })
      dmin = Math.min(dmin, d)
    }
    cand.sort((a, b) => a.d - b.d)
    let total = 0
    const top = cand.slice(0, 4).map((c) => {
      const w = Math.exp(-(c.d - dmin) / sigma)
      total += w
      return { b: c.b, w }
    })
    let kept = 0
    for (let k = 0; k < top.length; k++) {
      const w = top[k].w / total
      if (w < 0.01) continue
      joints[v * 4 + kept] = top[k].b
      weights[v * 4 + kept] = w
      kept++
    }
    const norm = weights[v * 4] + weights[v * 4 + 1] + weights[v * 4 + 2] + weights[v * 4 + 3]
    for (let k = 0; k < 4; k++) weights[v * 4 + k] /= norm
    dominantBone[v] = joints[v * 4]
  }

  const restInverse = new Float64Array(restMatrices.length * 16)
  restMatrices.forEach((m, i) => restInverse.set(new Matrix4().copy(m).invert().elements, i * 16))
  const restJoints = Object.fromEntries(
    baseSkeleton.map((b, i) => [b.name, new Vector3().setFromMatrixPosition(restMatrices[i]).toArray()]),
  ) as Record<BoneName, [number, number, number]>

  return {
    key: `${bodyKey(params)}@${cellRef}`,
    params,
    cell,
    skeleton: fitCapsules(baseSkeleton, restInverse, mesh.positions, dominantBone, weights),
    restInverse,
    restPositions: mesh.positions,
    indices: mesh.indices,
    topology: buildTopology(mesh.indices, n),
    joints,
    weights,
    dominantBone,
    restJoints,
  }
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const s = values.slice().sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]
}

/**
 * Fit each bone's elliptical capsule to the vertices it dominates (plan §5,
 * step 6). Proxies stay conservative: they cover ~97% of each region.
 */
function fitCapsules(
  skeleton: BoneSpec[],
  restInverse: Float64Array,
  positions: Float32Array,
  dominant: Uint8Array,
  weights: Float32Array,
): BoneSpec[] {
  const inv = new Matrix4()
  const v = new Vector3()
  return skeleton.map((bone, bi) => {
    inv.fromArray(restInverse, bi * 16)
    const s = bone.segment
    const a = new Vector3(...s.a)
    const axis = new Vector3(...s.b).sub(a)

    axis.normalize()
    const xAxis = new Vector3(1, 0, 0).addScaledVector(axis, -axis.x).normalize()
    const zAxis = new Vector3().crossVectors(xAxis, axis)
    const xs: number[] = []
    const zs: number[] = []
    const ts: number[] = []
    for (let i = 0; i < dominant.length; i++) {
      if (dominant[i] !== bi || weights[i * 4] < 0.55) continue
      v.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]).applyMatrix4(inv).sub(a)
      ts.push(v.dot(axis))
      xs.push(v.dot(xAxis))
      zs.push(v.dot(zAxis))
    }
    if (xs.length < 8) return bone
    // Asymmetric fit: the axis shifts towards the bulk (e.g. buttocks, belly).
    const x0 = percentile(xs, 0.02), x1 = percentile(xs, 0.98)
    const z0 = percentile(zs, 0.02), z1 = percentile(zs, 0.98)
    const rx = Math.max(0.012, (x1 - x0) / 2)
    const rz = Math.max(0.012, (z1 - z0) / 2)
    const offset = xAxis.clone().multiplyScalar((x0 + x1) / 2).addScaledVector(zAxis, (z0 + z1) / 2)
    a.add(offset)
    const rcap = Math.min(rx, rz)
    let t0 = percentile(ts, 0.01) + rcap
    let t1 = percentile(ts, 0.99) - rcap
    if (t1 < t0) {
      const mid = (t0 + t1) / 2
      t0 = mid - 0.001
      t1 = mid + 0.001
    }
    const pa = a.clone().addScaledVector(axis, t0)
    const pb = a.clone().addScaledVector(axis, t1)
    return {
      ...bone,
      segment: { a: pa.toArray() as [number, number, number], b: pb.toArray() as [number, number, number], rx, rz, rcap },
    }
  })
}
