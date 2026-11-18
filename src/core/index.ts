/**
 * Public surface of the framework-free core. The UI, workers and CLI import
 * from here; everything below is pure TypeScript + three.js math and runs in
 * the browser, in workers and in Node (tests, scripts).
 */
export { synthesizeScene } from './synthesis/synthesize'
export { compileDrawing, DEFAULT_DRAWING_OPTIONS } from './pipeline/compileDrawing'
export type { DrawingOptions, DrawingResult, DrawingReport, PopulationAccounting } from './pipeline/compileDrawing'
export { buildPreviewBatch } from './pipeline/previewBatch'
export type { PreviewBatch } from './pipeline/previewBatch'
export { composeLab, DEFAULT_LAB } from './lab/lab'
export type { LabSettings } from './lab/lab'
export { strokesToSvg } from './export/svg'
export { serializeScene, parseScene, snapshotHash, SnapshotError } from './export/snapshot'
export { PAPER_PROFILES, PAPER_BY_ID } from './scene/paper'
export { DEFAULT_SETTINGS } from './scene/types'
export type { SceneSettings, SceneSnapshot, PersonRecord } from './scene/types'
export { POSTURES } from './poses/types'
export type { Posture } from './poses/types'
export { ARCHETYPES } from './poses/archetypes'
export { MOTIF_BY_ID } from './motifs/motifLibrary'
export { REFERENCE_BODY } from './body/params'
export type { BodyParams } from './body/params'
export { cameraBasis } from './camera/projection'
export { shorelineZ, densityAt } from './synthesis/composition'
