import { Vector3 } from 'three'
import type { BoneName, BoneSpec } from '../assets/skeleton'
import { capsuleDistance } from '../constraints/collision'
import { clampToLimits } from '../constraints/jointLimits'
import { clamp, lerp } from '../math/geometry'
import { weightedPick, type Rng } from '../math/rng'
import { ARCHETYPES, type Archetype, type Range } from './archetypes'
import { capsuleBottom, capsulesFromMatrices, poseBody, quatToEuler } from './fk'
import { orientBone, solveTwoBone } from './ik'
import { limbBones, MODE_BY_ID, type EndSpec, type Frame, type ModeContext } from './limbModes'
import { Poser } from './poser'
import {
  LIMBS,
  type EulerDeg,
  type JointRotations,
  type Limb,
  type LimbGoal,
  type LimbParams,
  type PoseGoals,
  type PoseParams,
  type PoseResult,
  type Posture,
} from './types'

const r = (range: Range, u: number) => lerp(range[0], range[1], clamp(u, 0, 1))
const kindOf = (limb: Limb): 'arm' | 'leg' => (limb.startsWith('arm') ? 'arm' : 'leg')
const sfxOf = (limb: Limb): 'L' | 'R' => (limb.endsWith('L') ? 'L' : 'R')
const sideOf = (limb: Limb): 1 | -1 => (limb.endsWith('L') ? 1 : -1)
/** Extra unit parameters per limb for relaxed hand/foot orientation. */
const END_DIMS = 3

function modeDims(limb: Limb, mode: string): number {
  return MODE_BY_ID[`${kindOf(limb)}:${mode}`].dims + END_DIMS
}

// ---------------------------------------------------------------- sampling

function sampleLimbs(a: Archetype, rng: Rng): Record<Limb, LimbParams> {
  const fresh = (limb: Limb, mode: string): LimbParams => ({ mode, u: Array.from({ length: modeDims(limb, mode) }, () => rng.next()) })
  const mirrorOf = (p: LimbParams): LimbParams => ({ mode: p.mode, u: p.u.map((x) => clamp(x + rng.normal() * 0.08, 0, 1)) })
  let legL: LimbParams
  let legR: LimbParams
  if (a.legPairs) {
    const pick = Number(weightedPick(rng, Object.fromEntries(a.legPairs.map((p, i) => [String(i), p.w]))))
    const pair = a.legPairs[pick]
    legL = fresh('legL', pair.l)
    legR = pair.l === pair.r && rng.chance(a.mirror.legs) ? mirrorOf(legL) : fresh('legR', pair.r)
  } else {
    legL = fresh('legL', weightedPick(rng, a.legs))
    legR = rng.chance(a.mirror.legs) ? mirrorOf(legL) : fresh('legR', weightedPick(rng, a.legs))
  }
  const armL = fresh('armL', weightedPick(rng, a.arms))
  const armR = rng.chance(a.mirror.arms) ? mirrorOf(armL) : fresh('armR', weightedPick(rng, a.arms))
  return { legL, legR, armL, armR }
}

/** Draw a random pose description for a posture. */
export function samplePoseParams(posture: Posture, rng: Rng): PoseParams {
  const a = ARCHETYPES[posture]
  return {
    posture,
    side: rng.chance(0.5) ? 1 : -1,
    root: [rng.next(), rng.next()],
    spine: [rng.next(), rng.next(), rng.next()],
    head: [rng.next(), rng.next(), rng.next(), rng.next()],
    ground: rng.next(),
    limbs: sampleLimbs(a, rng),
  }
}

/**
 * Perturb a pose continuously (pose accommodation). Focus limbs move more and
 * may switch mode; the posture and support style are preserved.
 */
export function mutatePoseParams(p: PoseParams, rng: Rng, amount: number, focus: readonly Limb[] = LIMBS): PoseParams {
  const a = ARCHETYPES[p.posture]
  const jitter = (u: number[], s: number) => u.map((x) => clamp(x + rng.normal() * s, 0, 1))
  const limbs = { ...p.limbs }
  for (const limb of focus) {
    const cur = p.limbs[limb]
    const pool = kindOf(limb) === 'arm' ? a.arms : a.legPairs ? Object.fromEntries(a.legPairs.map((x) => [limb === 'legL' ? x.l : x.r, x.w])) : a.legs
    if (rng.chance(amount * 0.5)) {
      const mode = weightedPick(rng, pool)
      limbs[limb] = { mode, u: Array.from({ length: modeDims(limb, mode) }, () => rng.next()) }
    } else {
      limbs[limb] = { mode: cur.mode, u: jitter(cur.u, amount) }
    }
  }
  return {
    ...p,
    root: jitter(p.root, amount * 0.3),
    spine: jitter(p.spine, amount * 0.5),
    head: jitter(p.head, amount * 0.5),
    limbs,
  }
}

// ---------------------------------------------------------------- solving

function frameOf(poser: Poser, bone: BoneName): Frame {
  return { o: poser.position(bone), left: poser.axis(bone, 0), up: poser.axis(bone, 1), front: poser.axis(bone, 2) }
}

function horizontal(v: Vector3): Vector3 {
  return new Vector3(v.x, 0, v.z)
}

function spec(skeleton: BoneSpec[], n: BoneName): BoneSpec {
  const b = skeleton.find((x) => x.name === n)
  if (!b) throw new Error(`Skeleton has no bone ${n}`)
  return b
}

function bodyScale(skeleton: BoneSpec[]): number {
  return (spec(skeleton, 'spine').offset[1] + spec(skeleton, 'chest').offset[1]) / 0.3
}

function len(skeleton: BoneSpec[], n: BoneName): number {
  return Math.hypot(...spec(skeleton, n).offset)
}

function axialJoints(a: Archetype, p: PoseParams): JointRotations {
  const pitch = r(a.spine[0], p.spine[0])
  const yaw = r(a.spine[1], p.spine[1])
  const roll = r(a.spine[2], p.spine[2])
  const hp = r(a.head[0], p.head[0])
  const hy = r(a.head[1], p.head[1]) * (p.head[3] < 0.5 ? -1 : 1)
  const hr = r(a.head[2], p.head[2])
  return {
    spine: [0.45 * pitch, 0.4 * yaw, 0.5 * roll],
    chest: [0.55 * pitch, 0.6 * yaw, 0.5 * roll],
    neck: [0.4 * hp, 0.4 * hy, 0.5 * hr],
    head: [0.6 * hp, 0.6 * hy, 0.5 * hr],
  }
}

interface SkeletonMetrics {
  H: number
  ankleH: number
  handH: number
  armLen: number
  legLen: number
  thighLen: number
  radius: Record<BoneName, number>
}

const metricsCache = new WeakMap<BoneSpec[], SkeletonMetrics>()

function metrics(skeleton: BoneSpec[]): SkeletonMetrics {
  let m = metricsCache.get(skeleton)
  if (!m) {
    const standing = poseBody(skeleton, [0, 0, 0], {})
    const footIndex = skeleton.findIndex((b) => b.name === 'foot.L')
    const foot = standing.capsules[footIndex]
    // Ankle joint height above the sole when standing.
    const ankleH = Math.max(0.04, standing.matrices[footIndex * 16 + 13] - capsuleBottom(foot))
    const hand = spec(skeleton, 'hand.L').segment
    m = {
      H: bodyScale(skeleton),
      ankleH,
      handH: hand.rx + 0.012,
      armLen: len(skeleton, 'foreArm.L') + len(skeleton, 'hand.L'),
      legLen: len(skeleton, 'shin.L') + len(skeleton, 'foot.L'),
      thighLen: len(skeleton, 'shin.L'),
      radius: Object.fromEntries(skeleton.map((b) => [b.name, Math.max(b.segment.rx, b.segment.rz)])) as Record<BoneName, number>,
    }
    metricsCache.set(skeleton, m)
  }
  return m
}

function endEuler(poser: Poser, limb: Limb, end: EndSpec, u: number[], ctx: ModeContext): EulerDeg {
  const [upper, lower, endBone] = limbBones(kindOf(limb), sfxOf(limb))
  const s = sideOf(limb)
  const e = u.slice(-END_DIMS)
  if (end === 'footFlat') {
    let toe = horizontal(poser.axis(lower, 2))
    if (toe.lengthSq() < 1e-4) toe = ctx.heading.clone()
    toe.normalize()
    const up = new Vector3(0, 1, 0)
    orientBone(poser, endBone, new Vector3().crossVectors(up, toe), up)
  } else if (end === 'palmDown') {
    let fingers = horizontal(poser.axis(lower, 1).negate())
    if (fingers.lengthSq() < 1e-4) fingers = ctx.heading.clone()
    fingers.normalize()
    orientBone(poser, endBone, new Vector3(0, s, 0), fingers.negate())
  } else if (end === 'pointed') {
    poser.setLocalEuler(endBone, [lerp(50, 60, e[0]), 0, lerp(-8, 8, e[2]) * s])
  } else {
    const rot: EulerDeg =
      kindOf(limb) === 'leg'
        ? [lerp(-35, 25, e[0]), 0, lerp(-10, 10, e[2]) * s]
        : [lerp(-25, 20, e[0]), lerp(-20, 20, e[1]) * s, lerp(-15, 15, e[2]) * s]
    poser.setLocalEuler(endBone, rot)
  }
  void upper
  return clampToLimits(endBone, quatToEuler(poser.local[poser.index.get(endBone)!]))
}

function groundHeight(poser: Poser, a: Archetype, p: PoseParams, m: SkeletonMetrics): number {
  poser.update()
  const caps = capsulesFromMatrices(poser.skeleton, poser.world)
  const bottom = (bones: BoneName[]) => {
    const set = new Set(bones)
    return Math.min(...caps.filter((c) => set.has(c.bone)).map(capsuleBottom))
  }
  const hipY = (poser.position('thigh.L').y + poser.position('thigh.R').y) / 2
  switch (a.ground.kind) {
    case 'trunk':
      return bottom(['pelvis', 'spine', 'chest', 'head'])
    case 'pelvis':
      return bottom(['pelvis'])
    case 'feet':
      return hipY - (len(poser.skeleton, 'shin.L') + len(poser.skeleton, 'foot.L')) * r(a.ground.range, p.ground) - m.ankleH
    case 'knees':
      return hipY - len(poser.skeleton, 'shin.L') * r(a.ground.range, p.ground) - m.radius['shin.L']
  }
}

/**
 * Resolve a pose description into IK goals, then solve it. Lying bodies are
 * settled: the root is tilted until both the hip and shoulder contact groups
 * touch the sand.
 */
export function buildPose(skeleton: BoneSpec[], p: PoseParams): PoseResult {
  const a = ARCHETYPES[p.posture]
  let tilt = 0
  let result = buildPoseOnce(skeleton, p, tilt)
  if (a.ground.kind !== 'trunk' || a.restOn.length < 2) return result
  for (let it = 0; it < 3; it++) {
    const body = poseBody(skeleton, result.root, result.joints)
    const group = (bones: BoneName[]) => {
      const set = new Set(bones)
      const caps = body.capsules.filter((c) => set.has(c.bone))
      const lowest = caps.reduce((best, c) => (capsuleBottom(c) < capsuleBottom(best) ? c : best))
      return { gap: capsuleBottom(lowest), z: (lowest.a[2] + lowest.b[2]) / 2 }
    }
    const A = group(a.restOn[0])
    const B = group(a.restOn[1])
    if (Math.abs(A.gap - B.gap) < 0.01 || Math.abs(A.z - B.z) < 0.1) break
    tilt += Math.atan((A.gap - B.gap) / (A.z - B.z)) / DEG_PER_RAD
    tilt = clamp(tilt, -25, 25)
    result = buildPoseOnce(skeleton, p, tilt)
  }
  return result
}

const DEG_PER_RAD = Math.PI / 180

function buildPoseOnce(skeleton: BoneSpec[], p: PoseParams, tilt: number): PoseResult {
  const a = ARCHETYPES[p.posture]
  const m = metrics(skeleton)
  const poser = new Poser(skeleton)
  const root: EulerDeg = [r(a.pitch, p.root[0]) + tilt, r(a.roll, p.root[1]) * p.side, 0]
  const axial = axialJoints(a, p)
  poser.setRoot(root)
  for (const [bone, rot] of Object.entries(axial)) poser.setLocalEuler(bone as BoneName, rot)
  const groundY = groundHeight(poser, a, p, m)

  const pelvis = frameOf(poser, 'pelvis')
  let heading = horizontal(pelvis.front)
  if (heading.lengthSq() < 0.12) heading = horizontal(pelvis.up.clone().negate())
  heading.normalize()
  const ctxBase = {
    poser,
    groundY,
    H: m.H,
    pelvis,
    chest: frameOf(poser, 'chest'),
    head: frameOf(poser, 'head'),
    heading,
    leftH: new Vector3().crossVectors(new Vector3(0, 1, 0), heading).normalize(),
    armLen: len(skeleton, 'foreArm.L') + len(skeleton, 'hand.L'),
    legLen: m.legLen,
    thighLen: m.thighLen,
    bellyDepth: spec(skeleton, 'spine').segment.rz,
    chestDepth: spec(skeleton, 'chest').segment.rz,
  }
  const limbs = {} as Record<Limb, LimbGoal>
  const supports: BoneName[] = []
  const knee = {} as Record<'L' | 'R', Vector3>

  for (const limb of LIMBS) {
    const lp = p.limbs[limb]
    const kind = kindOf(limb)
    const sfx = sfxOf(limb)
    const mode = MODE_BY_ID[`${kind}:${lp.mode}`]
    const [upper, lower, end] = limbBones(kind, sfx)
    const ctx: ModeContext = {
      ...ctxBase,
      side: sideOf(limb),
      sfx,
      shoulder: poser.position(`upperArm.${sfx}`),
      hip: poser.position(`thigh.${sfx}`),
      knee: kind === 'arm' ? knee : undefined,
    }
    const goal = mode.goal(ctx, lp.u)
    const endH =
      goal.support === 'lower'
        ? m.radius[lower] * 0.8
        : kind === 'leg'
          ? goal.end === 'footFlat' ? m.ankleH : m.ankleH * 0.7
          : m.handH
    const minY = groundY + endH
    if (goal.ground === 'project' || goal.target.y < minY) goal.target.y = minY
    if (goal.support === 'end') supports.push(end)
    if (goal.support === 'lower') supports.push(lower)
    solveTwoBone(poser, upper, lower, end, goal.target, goal.pole, kind === 'arm' ? -1 : 1)
    const endRot = endEuler(poser, limb, goal.end, lp.u, ctx)
    poser.setLocalEuler(end, endRot)
    if (kind === 'leg') knee[sfx] = poser.position(lower)
    limbs[limb] = { target: goal.target.toArray() as [number, number, number], pole: goal.pole.toArray() as [number, number, number], end: endRot }
  }
  return solveGoals(skeleton, { posture: p.posture, root, axial, limbs, supports, restOn: a.restOn })
}

/** Solve IK goals into joint rotations and check validity. */
export function solveGoals(skeleton: BoneSpec[], goals: PoseGoals): PoseResult {
  const poser = new Poser(skeleton)
  poser.setRoot(goals.root)
  for (const [bone, rot] of Object.entries(goals.axial)) poser.setLocalEuler(bone as BoneName, rot)
  for (const limb of LIMBS) {
    const g = goals.limbs[limb]
    const kind = kindOf(limb)
    const [upper, lower, end] = limbBones(kind, sfxOf(limb))
    solveTwoBone(poser, upper, lower, end, new Vector3(...g.target), new Vector3(...g.pole), kind === 'arm' ? -1 : 1)
    poser.setLocalEuler(end, g.end)
  }
  const problems: string[] = []
  const joints: JointRotations = {}
  skeleton.forEach((bone, i) => {
    const raw = quatToEuler(poser.local[i])
    if (bone.name.startsWith('upperArm')) {
      // Euler limits are unreliable for the shoulder's large range; check the arm direction instead.
      const issue = shoulderIssue(poser, bone.name)
      if (issue) problems.push(issue)
      joints[bone.name] = raw
      return
    }
    const clamped = clampToLimits(bone.name, raw)
    const over = Math.max(...raw.map((x, k) => Math.abs(x - clamped[k])))
    if (over > 12) problems.push(`${bone.name} exceeds joint limit by ${over.toFixed(0)}° (${raw.map((x) => x.toFixed(0)).join(',')})`)
    if (raw.some((x) => Math.abs(x) > 1e-6) || bone.name === 'pelvis') joints[bone.name] = clamped
  })
  problems.push(...checkPose(skeleton, goals, joints))
  return { root: goals.root, joints, goals, problems }
}

/** Direction-cone check for the shoulder in the chest frame. */
function shoulderIssue(poser: Poser, bone: BoneName): string | null {
  const s = bone.endsWith('.L') ? 1 : -1
  const d = poser.axis(bone, 1).negate()
  const left = poser.axis('chest', 0)
  const up = poser.axis('chest', 1)
  const front = poser.axis('chest', 2)
  const x = d.dot(left) * s
  const y = d.dot(up)
  const z = d.dot(front)
  // Shoulder extension reaches about 60° (down and back is fine; level and back is not).
  if (z < -0.6 && y > -0.35) return `${bone} points too far behind the back`
  if (x < -0.55 && y > -0.2) return `${bone} crosses too far over the chest`
  if (z < -0.35 && y > 0.4 && x < 0.3) return `${bone} is twisted up behind the back`
  return null
}

/** Pairs of segments that must not interpenetrate, with allowed proxy overlap (fraction of body scale). */
const SELF_PAIRS: [RegExp, RegExp, number][] = [
  [/^foreArm/, /^(pelvis|spine|chest|head)$/, 0.045],
  [/^upperArm/, /^(pelvis|spine|head)$/, 0.03],
  [/^(foreArm|upperArm)/, /^(thigh|shin)/, 0.04],
  [/^foreArm\.L/, /^foreArm\.R/, 0.02],
  [/^thigh\.L/, /^thigh\.R/, 0.035],
  [/^shin\.L/, /^(shin|thigh)\.R/, 0.03],
  [/^shin\.R/, /^thigh\.L/, 0.03],
  [/^(thigh|shin)/, /^(chest|head)$/, 0.03],
]

function checkPose(skeleton: BoneSpec[], goals: PoseGoals, joints: JointRotations): string[] {
  const problems: string[] = []
  const body = poseBody(skeleton, goals.root, joints)
  const H = metrics(skeleton).H
  const caps = body.capsules
  const tol = 0.045 * H
  const gapOf = (bone: BoneName) => capsuleBottom(caps.find((x) => x.bone === bone)!)
  for (const bone of new Set(goals.supports)) {
    const gap = gapOf(bone)
    if (gap > tol) problems.push(`${bone} should rest on the ground (gap ${(gap * 100).toFixed(1)} cm)`)
  }
  for (const group of goals.restOn) {
    const gap = Math.min(...group.map(gapOf))
    if (gap > tol) problems.push(`${group.join('/')} should rest on the ground (gap ${(gap * 100).toFixed(1)} cm)`)
  }
  for (let i = 0; i < caps.length; i++) {
    for (let j = i + 1; j < caps.length; j++) {
      const a = caps[i]
      const b = caps[j]
      const pair = SELF_PAIRS.find(([x, y]) => (x.test(a.bone) && y.test(b.bone)) || (x.test(b.bone) && y.test(a.bone)))
      if (!pair) continue
      const d = capsuleDistance(a, b)
      if (-d > pair[2] * H) problems.push(`${a.bone} intersects ${b.bone} by ${(-d * 100).toFixed(1)} cm`)
    }
  }
  return problems
}

// ---------------------------------------------------------------- blending

const mix = (a: number[], b: number[], t: number) => a.map((x, i) => x + (b[i] - x) * t)

/**
 * Interpolate two poses in goal space (root, spine, IK targets, poles and end
 * orientations) and solve again, so every in-between is a constructed pose
 * rather than a joint-angle average. Works across modes and postures.
 */
export function blendGoals(a: PoseGoals, b: PoseGoals, t: number): PoseGoals {
  const axial: JointRotations = {}
  for (const bone of new Set([...Object.keys(a.axial), ...Object.keys(b.axial)]) as Set<BoneName>) {
    axial[bone] = mix(a.axial[bone] ?? [0, 0, 0], b.axial[bone] ?? [0, 0, 0], t) as EulerDeg
  }
  const bSupports = new Set(b.supports)
  const bRestOn = new Set(b.restOn.map((g) => g.join()))
  const limbs = {} as Record<Limb, LimbGoal>
  for (const limb of LIMBS) {
    const la = a.limbs[limb]
    const lb = b.limbs[limb]
    const pole = new Vector3(...(mix(la.pole, lb.pole, t) as [number, number, number]))
    if (pole.lengthSq() < 1e-6) pole.set(...lb.pole)
    limbs[limb] = {
      target: mix(la.target, lb.target, t) as [number, number, number],
      pole: pole.normalize().toArray() as [number, number, number],
      end: mix(la.end, lb.end, t) as EulerDeg,
    }
  }
  return {
    posture: t < 0.5 ? a.posture : b.posture,
    root: mix(a.root, b.root, t) as EulerDeg,
    axial,
    limbs,
    // Contacts belong to the end poses; in-betweens keep only those both share.
    supports: a.supports.filter((bone) => bSupports.has(bone)),
    restOn: a.restOn.filter((g) => bRestOn.has(g.join())),
  }
}

// ---------------------------------------------------------------- convenience

export interface GeneratedPose {
  params: PoseParams
  result: PoseResult
}

/** Override sampled limb modes with preferred ones (motif intentions). */
export function applyHints(p: PoseParams, hints: Partial<Record<Limb, string>> | undefined, rng: Rng): PoseParams {
  if (!hints) return p
  const limbs = { ...p.limbs }
  for (const [limb, mode] of Object.entries(hints) as [Limb, string][]) {
    limbs[limb] = { mode, u: Array.from({ length: modeDims(limb, mode) }, () => rng.next()) }
  }
  return { ...p, limbs }
}

/** Sample until a pose passes all checks (bounded); null if none was found. */
export function generateValidPose(
  skeleton: BoneSpec[],
  posture: Posture,
  rng: Rng,
  maxTries = 30,
  hints?: Partial<Record<Limb, string>>,
): GeneratedPose | null {
  for (let i = 0; i < maxTries; i++) {
    // Honour hints for most attempts, then fall back to free sampling.
    const params = applyHints(samplePoseParams(posture, rng), i < maxTries * 0.6 ? hints : undefined, rng)
    const result = buildPose(skeleton, params)
    if (result.problems.length === 0) return { params, result }
  }
  return null
}
