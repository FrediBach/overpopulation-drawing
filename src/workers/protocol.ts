import type { DrawingOptions, DrawingResult, SceneSettings, SceneSnapshot } from '@/core'

/** Messages to the pipeline worker. Every job carries the scene revision it belongs to. */
export type WorkerRequest =
  | { type: 'compileScene'; jobId: number; settings: SceneSettings }
  | { type: 'compileDrawing'; jobId: number; scene: SceneSnapshot; options: Partial<DrawingOptions> }

export type WorkerResponse =
  | { type: 'progress'; jobId: number; fraction: number; label: string }
  | { type: 'sceneResult'; jobId: number; scene: SceneSnapshot }
  | { type: 'drawingResult'; jobId: number; drawing: DrawingResult }
  | { type: 'error'; jobId: number; message: string }
