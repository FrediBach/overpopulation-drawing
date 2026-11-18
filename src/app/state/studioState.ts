import { DEFAULT_SETTINGS, type DrawingResult, type SceneSettings, type SceneSnapshot } from '@/core'
import type { ColorMode } from '@/preview/colors'

export type JobKind = 'scene' | 'drawing'

export interface JobState {
  kind: JobKind
  fraction: number
  label: string
}

export type ViewTab = 'shaded' | 'lines'

export interface StudioState {
  settings: SceneSettings
  scene: SceneSnapshot | null
  drawing: DrawingResult | null
  /** Paper used for the current drawing (may differ from the scene's for proofs). */
  details: boolean
  job: JobState | null
  error: string | null
  colorMode: ColorMode
  selectedId: number | null
  tab: ViewTab
}

export const initialStudioState: StudioState = {
  settings: DEFAULT_SETTINGS,
  scene: null,
  drawing: null,
  details: true,
  job: null,
  error: null,
  colorMode: 'person',
  selectedId: null,
  tab: 'shaded',
}

export type StudioAction =
  | { type: 'updateSettings'; patch: Partial<SceneSettings> }
  | { type: 'setDetails'; details: boolean }
  | { type: 'jobStarted'; kind: JobKind; label: string }
  | { type: 'jobProgress'; fraction: number; label: string }
  | { type: 'jobFailed'; message: string }
  | { type: 'jobCancelled' }
  | { type: 'sceneReady'; scene: SceneSnapshot }
  | { type: 'drawingReady'; drawing: DrawingResult }
  | { type: 'setColorMode'; mode: ColorMode }
  | { type: 'select'; id: number | null }
  | { type: 'setTab'; tab: ViewTab }
  | { type: 'dismissError' }

export function studioReducer(state: StudioState, action: StudioAction): StudioState {
  switch (action.type) {
    case 'updateSettings':
      return { ...state, settings: { ...state.settings, ...action.patch } }
    case 'setDetails':
      return { ...state, details: action.details }
    case 'jobStarted':
      return { ...state, job: { kind: action.kind, fraction: 0, label: action.label }, error: null }
    case 'jobProgress':
      return state.job ? { ...state, job: { ...state.job, fraction: action.fraction, label: action.label } } : state
    case 'jobFailed':
      return { ...state, job: null, error: action.message }
    case 'jobCancelled':
      return { ...state, job: null }
    case 'sceneReady':
      // A new scene invalidates the drawing derived from the previous one.
      return {
        ...state,
        job: null,
        scene: action.scene,
        settings: action.scene.settings,
        drawing: null,
        selectedId: null,
        tab: 'shaded',
      }
    case 'drawingReady':
      return { ...state, job: null, drawing: action.drawing, tab: 'lines' }
    case 'setColorMode':
      return { ...state, colorMode: action.mode }
    case 'select':
      return { ...state, selectedId: action.id }
    case 'setTab':
      return { ...state, tab: action.tab }
    case 'dismissError':
      return { ...state, error: null }
  }
}
