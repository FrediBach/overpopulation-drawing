/// <reference lib="webworker" />
import { buildPreviewBatch, compileDrawing, composeLab, synthesizeScene, type PreviewBatch, type SceneSnapshot } from '@/core'
import type { WorkerRequest, WorkerResponse } from './protocol'

declare const self: DedicatedWorkerGlobalScope

const post = (msg: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(msg, transfer)

const buffersOf = (p: PreviewBatch): Transferable[] => [
  p.positions.buffer,
  p.normals.buffer,
  p.indices.buffer,
  p.personVertexStart.buffer,
  p.personFaceStart.buffer,
]

// Body assets are cached in this worker across jobs, so later scenes reuse polygonised bodies.
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const req = event.data
  const progress = (fraction: number, label: string) => post({ type: 'progress', jobId: req.jobId, fraction, label })
  const withPreview = (scene: SceneSnapshot, from: number) => {
    const preview = buildPreviewBatch(scene, (f, label) => progress(from + (1 - from) * f, label))
    post({ type: 'sceneResult', jobId: req.jobId, result: { scene, preview } }, buffersOf(preview))
  }
  try {
    switch (req.type) {
      case 'compileScene':
        withPreview(synthesizeScene(req.settings, (f, l) => progress(f * 0.85, l)), 0.85)
        break
      case 'compileLab':
        withPreview(composeLab(req.lab, (f, l) => progress(f * 0.6, l)), 0.6)
        break
      case 'buildPreview':
        withPreview(req.scene, 0)
        break
      case 'compileDrawing':
        post({ type: 'drawingResult', jobId: req.jobId, drawing: compileDrawing(req.scene, req.options, progress) })
        break
    }
  } catch (err) {
    post({ type: 'error', jobId: req.jobId, message: err instanceof Error ? err.message : String(err) })
  }
}
