import type { EulerDeg, JointRotations, PoseParams, Posture } from '../poses/types'
import type { Outfit } from '../body/features'
import type { BodyParams } from '../body/params'
import type { BoneName } from '../assets/skeleton'
import type { PaperProfile } from './paper'

export const SCENE_SCHEMA_VERSION = 2

export interface SceneSettings {
  /** Requested population. */
  population: number
  seed: number
  /** 0 = generous spacing, 1 = maximum packing within valid poses. */
  crowding: number
  postureMix: Record<Posture, number>
  /** Fraction of people placed through authored interaction motifs. */
  motifShare: number
  /** Fraction of people who are children. */
  childShare: number
  /** Number of distinct body shapes in the scene's body bank. */
  bodyVariety: number
  paperId: string
  /** Camera elevation above the horizon, degrees. */
  elevationDeg: number
}

export const DEFAULT_SETTINGS: SceneSettings = {
  population: 120,
  seed: 7,
  crowding: 0.75,
  postureMix: { lyingBack: 3, lyingFront: 2, lyingSide: 1.5, sitting: 3, reclining: 1.5, kneeling: 0.5, standing: 1 },
  motifShare: 0.5,
  childShare: 0.08,
  bodyVariety: 16,
  paperId: 'A2',
  elevationDeg: 52,
}

/** High oblique orthographic camera, looking from +Z towards the sea at -Z. */
export interface CameraSpec {
  elevationDeg: number
  target: [number, number, number]
  /** Width of the framed view, metres in the projection plane. */
  viewWidth: number
  /** Height of the framed view, metres in the projection plane. */
  viewHeight: number
}

export interface Circle {
  x: number
  z: number
  r: number
}

export interface Blob extends Circle {
  /** Density added at the centre. */
  weight: number
}

/** Composition fields (plan §7): beach extent, shoreline, density shaping. */
export interface BeachLayout {
  /** Placement region in metres: x in [-halfWidth, halfWidth], z in [-halfDepth, halfDepth]. */
  halfWidth: number
  halfDepth: number
  /** Shoreline: z = shoreBase + sum of sines over x. Water is at smaller z. */
  shoreBase: number
  shoreWaves: { amp: number; freq: number; phase: number }[]
  baseDensity: number
  blobs: Blob[]
  pockets: Circle[]
  /** Narrow route towards the water as a polyline of [x, z] points. */
  corridor: [number, number][]
  corridorWidth: number
}

export interface PersonRecord {
  id: number
  /** Index into SceneSnapshot.bodies. */
  bodyIndex: number
  posture: Posture
  /** Latent pose description (null for poses made by blending). */
  pose: PoseParams | null
  /** Final numerical root orientation and joint rotations (degrees), saved rather than regenerated. */
  root: EulerDeg
  joints: JointRotations
  outfit: Outfit
  x: number
  z: number
  /** Radians about +Y. */
  yaw: number
  motifId: string | null
  groupId: number | null
  /** True when the fitter changed the pose to make room for neighbours. */
  accommodated: boolean
}

export interface Towel {
  id: number
  ownerId: number
  x: number
  z: number
  yaw: number
  width: number
  length: number
}

export type RelationshipKind = 'touch' | 'near'

export interface Relationship {
  a: number
  b: number
  kind: RelationshipKind
  boneA: BoneName
  boneB: BoneName
  /** Surface distance between proxies, metres. */
  distance: number
}

export interface UnresolvedRegion {
  x: number
  z: number
  reason: string
}

export type ValidationFailureKind = 'penetration' | 'ground' | 'joint-limit' | 'water' | 'pose'

export interface ValidationFailure {
  personId: number
  kind: ValidationFailureKind
  detail: string
  otherId?: number
  magnitude?: number
}

export interface ValidationReport {
  checkedPeople: number
  failures: ValidationFailure[]
  invalidPeople: number[]
  penetrationTolerance: number
}

export interface SceneStats {
  requested: number
  placed: number
  attempts: number
  rejectedCandidates: number
  motifInstances: number
  accommodations: number
  postureCounts: Record<Posture, number>
  timingMs: number
}

export interface SceneSnapshot {
  schemaVersion: typeof SCENE_SCHEMA_VERSION
  units: 'm'
  createdAt: string
  settings: SceneSettings
  paper: PaperProfile
  camera: CameraSpec
  beach: BeachLayout
  /** Body bank: every distinct body shape used by the scene. */
  bodies: BodyParams[]
  people: PersonRecord[]
  towels: Towel[]
  relationships: Relationship[]
  unresolved: UnresolvedRegion[]
  validation: ValidationReport
  stats: SceneStats
}
