/**
 * Public surface of the framework-free core. The UI, workers and CLI import
 * from here; everything below is pure TypeScript + three.js math and runs in
 * the browser, in workers and in Node (tests, scripts).
 */
export { synthesizeScene } from './synthesis/synthesize'
export { compileDrawing, DEFAULT_DRAWING_OPTIONS } from './pipeline/compileDrawing'
export type { DrawingOptions, DrawingResult, DrawingReport, PopulationAccounting } from './pipeline/compileDrawing'
export { strokesToSvg } from './export/svg'
export { serializeScene, parseScene, snapshotHash, SnapshotError } from './export/snapshot'
export { personCapsules } from './synthesis/personGeometry'
export { buildBodyMesh, bodyMeshIndices } from './assets/bodyMesh'
export { PREVIEW_RESOLUTION, EXPORT_RESOLUTION } from './assets/capsuleTemplate'
export { PAPER_PROFILES, PAPER_BY_ID } from './scene/paper'
export { DEFAULT_SETTINGS } from './scene/types'
export type { SceneSettings, SceneSnapshot, PersonRecord } from './scene/types'
export { POSTURES } from './poses/types'
export type { Posture } from './poses/types'
export { POSE_FAMILY_BY_ID } from './poses/poseLibrary'
export { MOTIF_BY_ID } from './motifs/motifLibrary'
export { BODY_VARIANT_BY_ID } from './assets/bodyVariants'
export { cameraBasis } from './camera/projection'
export { shorelineZ, densityAt } from './synthesis/composition'
