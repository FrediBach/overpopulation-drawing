import { SCENE_SCHEMA_VERSION, type SceneSnapshot } from '../scene/types'

/**
 * Versioned scene snapshot: the archival boundary between authoring and
 * drawing (plan §12). Final poses are stored as numbers, so reopening a
 * scene never reruns randomness or physics.
 */
export function serializeScene(scene: SceneSnapshot): string {
  return JSON.stringify(scene)
}

export class SnapshotError extends Error {}

export function parseScene(json: string): SceneSnapshot {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new SnapshotError('Scene file is not valid JSON')
  }
  if (!data || typeof data !== 'object') throw new SnapshotError('Scene file is empty')
  const s = data as Partial<SceneSnapshot>
  if (s.schemaVersion !== SCENE_SCHEMA_VERSION) {
    throw new SnapshotError(`Unsupported scene schema version ${String(s.schemaVersion)} (expected ${SCENE_SCHEMA_VERSION})`)
  }
  for (const key of ['people', 'towels', 'camera', 'paper', 'beach', 'validation', 'stats', 'settings'] as const) {
    if (s[key] === undefined) throw new SnapshotError(`Scene file is missing "${key}"`)
  }
  return s as SceneSnapshot
}

/** Short stable hash (FNV-1a, hex) used to tie exports to their snapshot. */
export function snapshotHash(json: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
