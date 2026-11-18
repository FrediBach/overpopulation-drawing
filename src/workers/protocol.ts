import type { DrawingOptions, DrawingResult, LabSettings, PreviewBatch, SceneSettings, SceneSnapshot } from '@/core'

/** Messages to the pipeline worker. */
export type WorkerRequest =
  | { type: 'compileScene'; jobId: number; settings: SceneSettings }
  | { type: 'compileLab'; jobId: number; lab: LabSettings }
  | { type: 'buildPreview'; jobId: number; scene: SceneSnapshot }
  | { type: 'compileDrawing'; jobId: number; scene: SceneSnapshot; options: Partial<DrawingOptions> }

export interface SceneWithPreview {
  scene: SceneSnapshot
  preview: PreviewBatch
}

export type WorkerResponse =
  | { type: 'progress'; jobId: number; fraction: number; label: string }
  | { type: 'sceneResult'; jobId: number; result: SceneWithPreview }
  | { type: 'drawingResult'; jobId: number; drawing: DrawingResult }
  | { type: 'error'; jobId: number; message: string }
