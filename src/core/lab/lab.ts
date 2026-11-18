import { getBodySkeleton } from '../body/asset'
import { OUTFITS } from '../body/features'
import { REFERENCE_BODY, sampleBodyParams, type BodyParams } from '../body/params'
import { frameCamera } from '../camera/projection'
import { DEG } from '../math/geometry'
import { createRng } from '../math/rng'
import { blendGoals, generateValidPose, solveGoals } from '../poses/generate'
import { POSTURES, type Posture } from '../poses/types'
import { drawableSize, PAPER_BY_ID } from '../scene/paper'
import { DEFAULT_SETTINGS, SCENE_SCHEMA_VERSION, type BeachLayout, type PersonRecord, type SceneSnapshot, type ValidationFailure } from '../scene/types'

export interface LabSettings {
  /** 'gallery' samples many poses; 'blend' interpolates from pose A to pose B. */
  mode: 'gallery' | 'blend'
  posture: Posture | 'all'
  /** Target posture for blend mode. */
  postureB: Posture
  /** Number of figures (gallery) or steps (blend). */
  count: number
  seed: number
  /** Varied bodies, or one shared body. */
  body: 'varied' | BodyParams
  paperId: string
  elevationDeg: number
}

export const DEFAULT_LAB: LabSettings = {
  mode: 'gallery',
  posture: 'all',
  postureB: 'standing',
  count: 15,
  seed: 1,
  body: 'varied',
  paperId: 'A3',
  elevationDeg: 35,
}

const LYING = new Set<Posture>(['lyingBack', 'lyingFront', 'lyingSide', 'reclining'])

/**
 * A study sheet for the pose generator: figures in a grid with no crowding,
 * as a regular scene snapshot so the same preview and drawing pipeline apply.
 */
export function composeLab(settings: LabSettings, onProgress?: (f: number, label: string) => void): SceneSnapshot {
  const t0 = performance.now()
  const rng = createRng(settings.seed, 'lab')
  const paper = PAPER_BY_ID[settings.paperId] ?? PAPER_BY_ID.A3
  const n = Math.max(1, Math.min(60, Math.round(settings.count)))
  const bodies: BodyParams[] = []
  const bodyFor = (i: number): number => {
    if (settings.body !== 'varied') {
      if (bodies.length === 0) bodies.push(settings.body)
      return 0
    }
    bodies.push(sampleBodyParams(rng, rng.chance(0.15) && i > 0))
    return bodies.length - 1
  }
  const failures: ValidationFailure[] = []
  const figures: Omit<PersonRecord, 'x' | 'z'>[] = []

  if (settings.mode === 'blend') {
    const bi = bodyFor(0)
    const sk = getBodySkeleton(bodies[bi])
    const postureA = settings.posture === 'all' ? 'sitting' : settings.posture
    const a = generateValidPose(sk, postureA, rng, 60)
    const b = generateValidPose(sk, settings.postureB, rng, 60)
    if (!a || !b) throw new Error('Could not generate valid end poses for the blend')
    const yaw = LYING.has(postureA) || LYING.has(settings.postureB) ? 90 * DEG : 0
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1)
      const res = solveGoals(sk, blendGoals(a.result.goals, b.result.goals, t))
      for (const problem of res.problems) failures.push({ personId: i, kind: 'pose', detail: problem })
      figures.push({
        id: i, bodyIndex: bi, posture: t < 0.5 ? postureA : settings.postureB,
        pose: i === 0 ? a.params : i === n - 1 ? b.params : null,
        root: res.root, joints: res.joints, outfit: OUTFITS[i % OUTFITS.length], yaw,
        motifId: null, groupId: null, accommodated: false,
      })
      onProgress?.(i / n, `Blending ${i + 1} / ${n}`)
    }
  } else {
    for (let i = 0; i < n; i++) {
      const posture = settings.posture === 'all' ? POSTURES[i % POSTURES.length] : settings.posture
      const bi = bodyFor(i)
      const sk = getBodySkeleton(bodies[bi])
      const g = generateValidPose(sk, posture, rng, 80)
      if (!g) {
        failures.push({ personId: i, kind: 'pose', detail: `No valid ${posture} pose found` })
        continue
      }
      figures.push({
        id: figures.length, bodyIndex: bi, posture, pose: g.params, root: g.result.root, joints: g.result.joints,
        outfit: rng.pick(OUTFITS), yaw: LYING.has(posture) ? 90 * DEG + (rng.chance(0.5) ? Math.PI : 0) : rng.range(-0.5, 0.5),
        motifId: null, groupId: null, accommodated: false,
      })
      onProgress?.(i / n, `Posing ${i + 1} / ${n}`)
    }
  }

  // Grid layout centred on the origin.
  const anyLying = figures.some((f) => LYING.has(f.posture))
  const spacing = anyLying ? 2.4 : 1.4
  const cols = settings.mode === 'blend' ? Math.min(figures.length, 8) : Math.ceil(Math.sqrt(figures.length * 1.6))
  const rows = Math.ceil(figures.length / cols)
  const people: PersonRecord[] = figures.map((f, i) => ({
    ...f,
    x: ((i % cols) - (cols - 1) / 2) * spacing,
    z: (Math.floor(i / cols) - (rows - 1) / 2) * spacing * 1.25,
  }))
  const { width, height } = drawableSize(paper)
  const sinE = Math.sin(settings.elevationDeg * DEG)
  const cosE = Math.cos(settings.elevationDeg * DEG)
  const needH = rows * spacing * 1.25 * sinE + 1.9 * cosE
  const viewWidth = Math.max(cols * spacing, (needH * width) / height)
  const camera = frameCamera(paper, settings.elevationDeg, viewWidth)
  const halfWidth = viewWidth / 2 + 1
  const halfDepth = camera.viewHeight / Math.max(0.2, sinE) / 2 + 1
  const beach: BeachLayout = {
    halfWidth,
    halfDepth,
    shoreBase: -halfDepth - 100,
    shoreWaves: [],
    baseDensity: 0,
    blobs: [],
    pockets: [],
    corridor: [[0, 0], [0, 0]],
    corridorWidth: 0,
  }
  const invalid = [...new Set(failures.map((f) => f.personId))]
  return {
    schemaVersion: SCENE_SCHEMA_VERSION,
    units: 'm',
    createdAt: new Date().toISOString(),
    settings: { ...DEFAULT_SETTINGS, population: people.length, seed: settings.seed, paperId: paper.id, elevationDeg: settings.elevationDeg },
    paper,
    camera,
    beach,
    bodies: bodies.length ? bodies : [REFERENCE_BODY],
    people,
    towels: [],
    relationships: [],
    unresolved: [],
    validation: { checkedPeople: people.length, failures, invalidPeople: invalid, penetrationTolerance: 0 },
    stats: {
      requested: n,
      placed: people.length,
      attempts: n,
      rejectedCandidates: 0,
      motifInstances: 0,
      accommodations: 0,
      postureCounts: Object.fromEntries(POSTURES.map((p) => [p, people.filter((x) => x.posture === p).length])) as Record<Posture, number>,
      timingMs: performance.now() - t0,
    },
  }
}
