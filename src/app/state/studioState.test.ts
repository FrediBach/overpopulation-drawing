import { buildPreviewBatch, DEFAULT_SETTINGS, synthesizeScene } from '@/core'
import { initialStudioState, studioReducer } from './studioState'

describe('studioReducer', () => {
  it('merges settings patches', () => {
    const s = studioReducer(initialStudioState, { type: 'updateSettings', patch: { population: 500 } })
    expect(s.settings.population).toBe(500)
    expect(s.settings.seed).toBe(DEFAULT_SETTINGS.seed)
  })

  it('tracks job lifecycle', () => {
    let s = studioReducer(initialStudioState, { type: 'jobStarted', kind: 'scene', label: 'x' })
    s = studioReducer(s, { type: 'jobProgress', fraction: 0.5, label: 'half' })
    expect(s.job).toEqual({ kind: 'scene', fraction: 0.5, label: 'half' })
    s = studioReducer(s, { type: 'jobFailed', message: 'boom' })
    expect(s.job).toBeNull()
    expect(s.error).toBe('boom')
  })

  it('invalidates the drawing and selection when a new scene arrives', () => {
    const scene = synthesizeScene({ ...DEFAULT_SETTINGS, population: 12, bodyVariety: 3 })
    const withDrawing = { ...initialStudioState, selectedId: 3, drawing: {} as never }
    const s = studioReducer(withDrawing, { type: 'sceneReady', scene, preview: buildPreviewBatch(scene) })
    expect(s.drawing).toBeNull()
    expect(s.selectedId).toBeNull()
    expect(s.scene).toBe(scene)
  })

  it('keeps crowd settings when a lab sheet is shown', () => {
    const scene = synthesizeScene({ ...DEFAULT_SETTINGS, population: 5, seed: 99, bodyVariety: 2 })
    const s = studioReducer(initialStudioState, { type: 'sceneReady', scene, preview: buildPreviewBatch(scene), fromLab: true })
    expect(s.settings).toBe(initialStudioState.settings)
  })
})
