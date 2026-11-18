import { DEFAULT_LAB, DEFAULT_SETTINGS, type DrawingResult, type LabSettings, type PreviewBatch, type SceneSettings, type SceneSnapshot } from '@/core'
import type { ColorMode } from '@/preview/colors'

export type JobKind = 'scene' | 'drawing'

export interface JobState {
  kind: JobKind
  fraction: number
  label: string
}

export type ViewTab = 'shaded' | 'lines'
/** Crowd composes a beach; the lab studies the pose generator and bodies in isolation. */
export type StudioMode = 'crowd' | 'lab'

export interface StudioState {
  mode: StudioMode
  settings: SceneSettings
  lab: LabSettings
  scene: SceneSnapshot | null
  preview: PreviewBatch | null
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
  mode: 'crowd',
  settings: DEFAULT_SETTINGS,
  lab: DEFAULT_LAB,
  scene: null,
  preview: null,
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
  | { type: 'updateLab'; patch: Partial<LabSettings> }
  | { type: 'setMode'; mode: StudioMode }
  | { type: 'setDetails'; details: boolean }
  | { type: 'jobStarted'; kind: JobKind; label: string }
  | { type: 'jobProgress'; fraction: number; label: string }
  | { type: 'jobFailed'; message: string }
  | { type: 'jobCancelled' }
  | { type: 'sceneReady'; scene: SceneSnapshot; preview: PreviewBatch; fromLab?: boolean }
  | { type: 'drawingReady'; drawing: DrawingResult }
  | { type: 'setColorMode'; mode: ColorMode }
  | { type: 'select'; id: number | null }
  | { type: 'setTab'; tab: ViewTab }
  | { type: 'dismissError' }

export function studioReducer(state: StudioState, action: StudioAction): StudioState {
  switch (action.type) {
    case 'updateSettings':
      return { ...state, settings: { ...state.settings, ...action.patch } }
    case 'updateLab':
      return { ...state, lab: { ...state.lab, ...action.patch } }
    case 'setMode':
      return { ...state, mode: action.mode }
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
        preview: action.preview,
        settings: action.fromLab ? state.settings : action.scene.settings,
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
