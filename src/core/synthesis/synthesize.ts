import type { BoneName, BoneSpec } from '../assets/skeleton'
import { getBodySkeleton } from '../body/asset'
import { OUTFITS } from '../body/features'
import { sampleBodyParams, type BodyParams } from '../body/params'
import { frameCamera } from '../camera/projection'
import { CollisionWorld } from '../constraints/collision'
import { clamp, DEG, lerp } from '../math/geometry'
import { createRng, weightedPick } from '../math/rng'
import { AVERAGE_MOTIF_SIZE, MOTIFS, type Motif } from '../motifs/motifLibrary'
import { ARCHETYPES } from '../poses/archetypes'
import { poseBody, type Capsule } from '../poses/fk'
import { buildPose, generateValidPose, mutatePoseParams } from '../poses/generate'
import { LIMBS, POSTURES, type Limb, type PoseParams, type PoseResult, type Posture } from '../poses/types'
import { PAPER_BY_ID } from '../scene/paper'
import {
  SCENE_SCHEMA_VERSION,
  type PersonRecord,
  type SceneSettings,
  type SceneSnapshot,
  type Towel,
  type UnresolvedRegion,
} from '../scene/types'
import { validateScene } from '../validation/validate'
import { createBeachLayout, densityAt, preferredYaw, viewWidthFor } from './composition'
import { fitRoot, type FitOptions, type FitResult } from './fit'

export type ProgressFn = (fraction: number, label: string) => void

interface MemberRequest {
  posture: Posture
  hints?: Partial<Record<Limb, string>>
  bodyIndex: number
  x: number
  z: number
  yaw: number
  maxDrift: number
  towel: boolean
}

function limbOfBone(bone: BoneName): Limb | null {
  const m = /^(upperArm|foreArm|hand|thigh|shin|foot)\.(L|R)$/.exec(bone)
  if (!m) return null
  return `${['thigh', 'shin', 'foot'].includes(m[1]) ? 'leg' : 'arm'}${m[2]}` as Limb
}

function motifWeight(motif: Motif, mix: Record<Posture, number>): number {
  const total = POSTURES.reduce((s, p) => s + Math.max(0, mix[p]), 0) || 1
  let w = 0
  for (const m of motif.members) {
    const share = Math.max(0, mix[m.posture]) / total
    if (share <= 0) return 0
    w += share
  }
  return w / motif.members.length
}

/** Number of continuous pose mutations tried before giving up on a placement. */
const ACCOMMODATION_TRIES = 6

/**
 * Scene compiler (plan §7): build a bank of organic bodies, place motifs and
 * single figures with freshly generated poses, fit each against committed
 * neighbours, accommodate conflicts by continuously mutating the conflicting
 * limbs, then validate everything.
 */
export function synthesizeScene(settings: SceneSettings, onProgress?: ProgressFn): SceneSnapshot {
  const t0 = performance.now()
  const paper = PAPER_BY_ID[settings.paperId] ?? PAPER_BY_ID.A2
  const camera = frameCamera(paper, settings.elevationDeg, viewWidthFor(settings, paper))
  const layout = createBeachLayout(settings, camera.viewWidth, camera.viewHeight)

  const placeRng = createRng(settings.seed, 'placement')
  const poseRng = createRng(settings.seed, 'poses')
  const bodyRng = createRng(settings.seed, 'bodies')

  // Body bank.
  const adultCount = Math.max(1, Math.round(settings.bodyVariety))
  const childCount = settings.childShare > 0 ? Math.max(1, Math.round(settings.bodyVariety * 0.25)) : 0
  const bodies: BodyParams[] = [
    ...Array.from({ length: adultCount }, () => sampleBodyParams(bodyRng, false)),
    ...Array.from({ length: childCount }, () => sampleBodyParams(bodyRng, true)),
  ]
  const skeletons: BoneSpec[][] = bodies.map((b, i) => {
    onProgress?.(0.25 * (i / bodies.length), `Building bodies ${i + 1} / ${bodies.length}`)
    return getBodySkeleton(b)
  })
  const pickBody = (child: boolean): number =>
    (child || bodyRng.chance(settings.childShare)) && childCount > 0
      ? adultCount + bodyRng.int(0, childCount)
      : bodyRng.int(0, adultCount)

  const crowding = clamp(settings.crowding, 0, 1)
  const fitOptions: FitOptions = {
    clearance: lerp(0.05, 0.004, crowding),
    maxIterations: 28,
    maxDrift: 0.6,
    maxYawDrift: 0.5,
  }
  const attachChance = lerp(0.1, 0.55, crowding)
  const avgMotif = AVERAGE_MOTIF_SIZE
  const s = clamp(settings.motifShare, 0, 1)
  const motifChance = s / (avgMotif - (avgMotif - 1) * s)
  const motifWeights = Object.fromEntries(MOTIFS.map((m) => [m.id, motifWeight(m, settings.postureMix)]))
  const anyMotif = Object.values(motifWeights).some((w) => w > 0)

  const world = new CollisionWorld(0.5)
  const people: PersonRecord[] = []
  const capsulesByPerson: Capsule[][] = []
  const towels: Towel[] = []
  const unresolved: UnresolvedRegion[] = []
  let attempts = 0
  let rejected = 0
  let motifInstances = 0
  let accommodations = 0
  let groupCounter = 0

  const target = Math.max(0, Math.floor(settings.population))
  const maxAttempts = target * 10 + 50

  const samplePosition = (): { x: number; z: number } | null => {
    for (let tries = 0; tries < 40; tries++) {
      let x: number
      let z: number
      if (people.length > 0 && placeRng.chance(attachChance)) {
        const near = people[placeRng.int(0, people.length)]
        const a = placeRng.range(0, Math.PI * 2)
        const d = placeRng.range(0.55, 1.15)
        x = near.x + Math.cos(a) * d
        z = near.z + Math.sin(a) * d
      } else {
        x = placeRng.range(-layout.halfWidth, layout.halfWidth)
        z = placeRng.range(-layout.halfDepth, layout.halfDepth)
      }
      const density = densityAt(layout, x, z)
      if (density > 0 && placeRng.next() < density ** 1.3) return { x, z }
    }
    return null
  }

  const singleYaw = (posture: Posture, x: number, z: number): number => {
    const base = preferredYaw(x, z)
    if (posture === 'lyingBack' || posture === 'lyingFront' || posture === 'lyingSide' || posture === 'reclining') {
      const r = placeRng.next()
      const turn = r < 0.55 ? 0 : r < 0.75 ? Math.PI : r < 0.88 ? Math.PI / 2 : -Math.PI / 2
      return base + turn + placeRng.normal() * 0.15
    }
    return base + placeRng.normal() * 0.6
  }

  const tryCommit = (req: MemberRequest, motifId: string | null, groupId: number | null): boolean => {
    const skeleton = skeletons[req.bodyIndex]
    const generated = generateValidPose(skeleton, req.posture, poseRng, 24, req.hints)
    if (!generated) return false
    let params: PoseParams = generated.params
    let pose: PoseResult = generated.result
    const start = { x: req.x, z: req.z, yaw: req.yaw }
    const opts = { ...fitOptions, maxDrift: req.maxDrift }
    let fit: FitResult = fitRoot(world, poseBody(skeleton, pose.root, pose.joints), start, opts)
    let accommodated = false
    // Pose accommodation: continuously reshape the limbs that collide.
    for (let k = 0; !fit.ok && k < ACCOMMODATION_TRIES; k++) {
      const focus = [...new Set([...fit.conflictBones].map(limbOfBone).filter((l): l is Limb => l !== null))]
      const limbs = focus.length > 0 ? focus : [LIMBS[poseRng.int(0, 4)]]
      const candidate = mutatePoseParams(params, poseRng, 0.25 + 0.08 * k, limbs)
      const result = buildPose(skeleton, candidate)
      if (result.problems.length > 0) continue
      const attempt = fitRoot(world, poseBody(skeleton, result.root, result.joints), start, opts)
      if (attempt.ok || attempt.maxPenetration < fit.maxPenetration) {
        params = candidate
        pose = result
        fit = attempt
        accommodated = true
      }
    }
    if (!fit.ok) return false
    const { placement } = fit
    if (densityAt(layout, placement.x, placement.z) <= 0) return false
    const id = people.length
    if (accommodated) accommodations++
    people.push({
      id,
      bodyIndex: req.bodyIndex,
      posture: req.posture,
      pose: params,
      root: pose.root,
      joints: pose.joints,
      outfit: bodyRng.pick(OUTFITS),
      x: placement.x,
      z: placement.z,
      yaw: placement.yaw,
      motifId,
      groupId,
      accommodated,
    })
    capsulesByPerson.push(fit.capsules)
    world.add(id, fit.capsules)
    const archetype = ARCHETYPES[req.posture]
    if (archetype.towel && (req.towel || bodyRng.chance(0.55))) {
      const h = bodies[req.bodyIndex].height
      const sitting = req.posture === 'sitting' || req.posture === 'reclining'
      towels.push({
        id: towels.length,
        ownerId: id,
        x: placement.x,
        z: placement.z,
        yaw: placement.yaw + bodyRng.normal() * 0.06,
        width: bodyRng.range(0.75, 0.95) * h,
        length: (sitting ? bodyRng.range(1.3, 1.6) : bodyRng.range(1.65, 1.9)) * h,
      })
    }
    return true
  }

  let lastReport = 0
  while (people.length < target && attempts < maxAttempts) {
    attempts++
    const anchor = samplePosition()
    if (!anchor) continue
    if (anyMotif && placeRng.chance(motifChance)) {
      const motifId = weightedPick(placeRng, motifWeights)
      const motif = MOTIFS.find((m) => m.id === motifId)!
      const frameYaw = preferredYaw(anchor.x, anchor.z) + placeRng.normal() * 0.5
      const cos = Math.cos(frameYaw)
      const sin = Math.sin(frameYaw)
      const groupId = groupCounter++
      let placed = 0
      for (const member of motif.members) {
        if (people.length >= target) break
        const ok = tryCommit(
          {
            posture: member.posture,
            hints: member.hints,
            bodyIndex: pickBody(!!member.child),
            x: anchor.x + member.dx * cos + member.dz * sin,
            z: anchor.z - member.dx * sin + member.dz * cos,
            yaw: frameYaw + member.yaw * DEG + placeRng.normal() * 0.05,
            maxDrift: motif.maxDrift,
            towel: !!member.towel,
          },
          motif.id,
          groupId,
        )
        if (ok) placed++
        else rejected++
      }
      if (placed > 0) motifInstances++
    } else {
      const posture = weightedPick(placeRng, settings.postureMix)
      const ok = tryCommit(
        {
          posture,
          bodyIndex: pickBody(false),
          x: anchor.x,
          z: anchor.z,
          yaw: singleYaw(posture, anchor.x, anchor.z),
          maxDrift: 0.6,
          towel: false,
        },
        null,
        null,
      )
      if (!ok) {
        rejected++
        if (unresolved.length < 64 && rejected % 4 === 0) {
          unresolved.push({ x: anchor.x, z: anchor.z, reason: 'No valid fit within drift and retry budget' })
        }
      }
    }
    if (onProgress && people.length - lastReport >= 10) {
      lastReport = people.length
      onProgress(0.25 + 0.65 * (people.length / Math.max(1, target)), `Placed ${people.length} / ${target}`)
    }
  }

  onProgress?.(0.92, 'Validating')
  const { report, relationships } = validateScene(people, capsulesByPerson, layout)

  const postureCounts = Object.fromEntries(POSTURES.map((p) => [p, 0])) as Record<Posture, number>
  for (const p of people) postureCounts[p.posture]++

  onProgress?.(1, 'Done')
  return {
    schemaVersion: SCENE_SCHEMA_VERSION,
    units: 'm',
    createdAt: new Date().toISOString(),
    settings: structuredClone(settings),
    paper,
    camera,
    beach: layout,
    bodies,
    people,
    towels,
    relationships,
    unresolved,
    validation: report,
    stats: {
      requested: target,
      placed: people.length,
      attempts,
      rejectedCandidates: rejected,
      motifInstances,
      accommodations,
      postureCounts,
      timingMs: performance.now() - t0,
    },
  }
}
