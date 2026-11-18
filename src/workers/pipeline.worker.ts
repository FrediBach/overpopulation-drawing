/// <reference lib="webworker" />
import { compileDrawing, synthesizeScene } from '@/core'
import type { WorkerRequest, WorkerResponse } from './protocol'

declare const self: DedicatedWorkerGlobalScope

const post = (msg: WorkerResponse) => self.postMessage(msg)

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const req = event.data
  const progress = (fraction: number, label: string) => post({ type: 'progress', jobId: req.jobId, fraction, label })
  try {
    if (req.type === 'compileScene') {
      post({ type: 'sceneResult', jobId: req.jobId, scene: synthesizeScene(req.settings, progress) })
    } else {
      post({ type: 'drawingResult', jobId: req.jobId, drawing: compileDrawing(req.scene, req.options, progress) })
    }
  } catch (err) {
    post({ type: 'error', jobId: req.jobId, message: err instanceof Error ? err.message : String(err) })
  }
}
