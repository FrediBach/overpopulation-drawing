import { BODY_VARIANTS, BODY_VARIANT_BY_ID, type BodyVariant } from '../assets/bodyVariants'
import { OUTFITS } from '../assets/bodyMesh'
import { BONE_NAMES } from '../assets/skeleton'
import { frameCamera } from '../camera/projection'
import { CollisionWorld } from '../constraints/collision'
import { clampToLimits } from '../constraints/jointLimits'
import { clamp, DEG, lerp } from '../math/geometry'
import { createRng, weightedPick, type Rng } from '../math/rng'
import { AVERAGE_MOTIF_SIZE, MOTIFS, type Motif, type MotifMember } from '../motifs/motifLibrary'
import { poseBody, type Capsule, type PosedBody } from '../poses/fk'
import { familiesForPosture, POSE_FAMILY_BY_ID, resolveJoints } from '../poses/poseLibrary'
import { POSTURES, type JointRotations, type PoseFamily, type Posture } from '../poses/types'
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
import { fitRoot, type FitOptions } from './fit'

export type ProgressFn = (fraction: number, label: string) => void

interface MemberRequest {
  family: PoseFamily
  variant: string
  bodyVariant: BodyVariant
  x: number
  z: number
  yaw: number
  maxDrift: number
  towel: boolean
}

const ADULTS = BODY_VARIANTS.filter((v) => v.id !== 'child')

function jitterJoints(rng: Rng, family: PoseFamily, base: JointRotations): JointRotations {
  const joints: JointRotations = {}
  for (const name of BONE_NAMES) {
    const r = base[name]
    if (r) joints[name] = [r[0], r[1], r[2]]
  }
  for (const adj of family.adjust) {
    const r = joints[adj.bone] ?? [0, 0, 0]
    r[adj.axis] += clamp(rng.normal() * 0.5, -1, 1) * adj.range
    joints[adj.bone] = r
  }
  for (const name of Object.keys(joints) as (keyof JointRotations)[]) {
    joints[name] = clampToLimits(name, joints[name]!)
  }
  return joints
}

function motifWeight(motif: Motif, mix: Record<Posture, number>): number {
  const total = POSTURES.reduce((s, p) => s + Math.max(0, mix[p]), 0) || 1
  let w = 0
  for (const m of motif.members) {
    const posture = POSE_FAMILY_BY_ID[m.family].posture
    const share = Math.max(0, mix[posture]) / total
    if (share <= 0) return 0
    w += share
  }
  return w / motif.members.length
}

/**
 * Scene compiler (plan §7): place a conservative composition from motifs and
 * single figures, fit each body locally against already-committed neighbours,
 * accommodate with alternate limb placements, then validate everything.
 */
export function synthesizeScene(settings: SceneSettings, onProgress?: ProgressFn): SceneSnapshot {
  const t0 = performance.now()
  const paper = PAPER_BY_ID[settings.paperId] ?? PAPER_BY_ID.A2
  const camera = frameCamera(paper, settings.elevationDeg, viewWidthFor(settings, paper))
  const layout = createBeachLayout(settings, camera.viewWidth, camera.viewHeight)

  const placeRng = createRng(settings.seed, 'placement')
  const poseRng = createRng(settings.seed, 'poses')
  const bodyRng = createRng(settings.seed, 'bodies')

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
    if (posture === 'lyingBack' || posture === 'lyingFront' || posture === 'reclining') {
      const r = placeRng.next()
      const turn = r < 0.55 ? 0 : r < 0.75 ? Math.PI : r < 0.88 ? Math.PI / 2 : -Math.PI / 2
      return base + turn + placeRng.normal() * 0.15
    }
    return base + placeRng.normal() * 0.6
  }

  const tryCommit = (req: MemberRequest, motifId: string | null, groupId: number | null): boolean => {
    const family = req.family
    const variantOrder = [req.variant, ...family.variants.map((v) => v.id).filter((id) => id !== req.variant)]
    // Each alternative carries the same jitter so accommodation is a limb change, not a new person.
    const jitterSeed = poseRng.int(0, 2 ** 31)
    let best: { ok: boolean; body: PosedBody; joints: JointRotations; variant: string; fit: ReturnType<typeof fitRoot> } | null = null
    for (const variantId of variantOrder) {
      const joints = jitterJoints(createRng(jitterSeed, 'jitter'), family, resolveJoints(family, variantId))
      const body = poseBody(req.bodyVariant, family.root, joints)
      const fit = fitRoot(world, body, { x: req.x, z: req.z, yaw: req.yaw }, { ...fitOptions, maxDrift: req.maxDrift })
      if (fit.ok) {
        best = { ok: true, body, joints, variant: variantId, fit }
        break
      }
    }
    if (!best) return false
    const { placement } = best.fit
    if (densityAt(layout, placement.x, placement.z) <= 0) return false
    const id = people.length
    const accommodated = best.variant !== req.variant
    if (accommodated) accommodations++
    people.push({
      id,
      bodyVariant: req.bodyVariant.id,
      family: family.id,
      variant: best.variant,
      outfit: bodyRng.pick(OUTFITS),
      joints: best.joints,
      x: placement.x,
      z: placement.z,
      yaw: placement.yaw,
      motifId,
      groupId,
      accommodated,
    })
    capsulesByPerson.push(best.fit.capsules)
    world.add(id, best.fit.capsules)
    if (family.towel && (req.towel || bodyRng.chance(0.55))) {
      const sitting = family.posture === 'sitting'
      towels.push({
        id: towels.length,
        ownerId: id,
        x: placement.x,
        z: placement.z,
        yaw: placement.yaw + bodyRng.normal() * 0.06,
        width: bodyRng.range(0.75, 0.95) * req.bodyVariant.height,
        length: (sitting ? bodyRng.range(1.2, 1.5) : bodyRng.range(1.65, 1.9)) * req.bodyVariant.height,
      })
    }
    return true
  }

  const pickBody = (child: boolean): BodyVariant =>
    child || bodyRng.chance(settings.childShare) ? BODY_VARIANT_BY_ID.child : bodyRng.pick(ADULTS)

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
      for (const member of motif.members as MotifMember[]) {
        if (people.length >= target) break
        const ok = tryCommit(
          {
            family: POSE_FAMILY_BY_ID[member.family],
            variant: member.variant,
            bodyVariant: pickBody(!!member.child),
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
      const family = placeRng.pick(familiesForPosture(posture))
      const ok = tryCommit(
        {
          family,
          variant: placeRng.pick(family.variants).id,
          bodyVariant: pickBody(false),
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
      onProgress(0.9 * (people.length / Math.max(1, target)), `Placed ${people.length} / ${target}`)
    }
  }

  onProgress?.(0.92, 'Validating')
  const { report, relationships } = validateScene(people, capsulesByPerson, layout)

  const postureCounts = Object.fromEntries(POSTURES.map((p) => [p, 0])) as Record<Posture, number>
  for (const p of people) postureCounts[POSE_FAMILY_BY_ID[p.family].posture]++

  onProgress?.(1, 'Done')
  return {
    schemaVersion: SCENE_SCHEMA_VERSION,
    units: 'm',
    createdAt: new Date().toISOString(),
    settings: structuredClone(settings),
    paper,
    camera,
    beach: layout,
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
