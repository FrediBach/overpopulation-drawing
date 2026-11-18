import type { DrawingOptions, DrawingResult, SceneSettings, SceneSnapshot } from '@/core'
import type { WorkerRequest, WorkerResponse } from './protocol'

export type ProgressListener = (fraction: number, label: string) => void

export class JobCancelledError extends Error {
  constructor() {
    super('Job cancelled')
  }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

interface Pending {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
  onProgress?: ProgressListener
}

/**
 * Runs heavy jobs off the main thread. The core is synchronous, so
 * cancellation terminates the worker and starts a fresh one; results from
 * obsolete jobs are discarded by id.
 */
export class PipelineClient {
  private worker: Worker | null = null
  private nextId = 1
  private pending = new Map<number, Pending>()
  private readonly createWorker: () => Worker

  constructor(createWorker?: () => Worker) {
    this.createWorker =
      createWorker ?? (() => new Worker(new URL('./pipeline.worker.ts', import.meta.url), { type: 'module' }))
  }

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = this.createWorker()
      this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.handle(e.data)
      this.worker.onerror = (e) => {
        for (const p of this.pending.values()) p.reject(new Error(e.message || 'Worker failed'))
        this.pending.clear()
        this.worker?.terminate()
        this.worker = null
      }
    }
    return this.worker
  }

  private handle(msg: WorkerResponse): void {
    const job = this.pending.get(msg.jobId)
    if (!job) return
    switch (msg.type) {
      case 'progress':
        job.onProgress?.(msg.fraction, msg.label)
        return
      case 'sceneResult':
        job.resolve(msg.scene)
        break
      case 'drawingResult':
        job.resolve(msg.drawing)
        break
      case 'error':
        job.reject(new Error(msg.message))
        break
    }
    this.pending.delete(msg.jobId)
  }

  private run<T>(req: DistributiveOmit<WorkerRequest, 'jobId'>, onProgress?: ProgressListener): Promise<T> {
    const jobId = this.nextId++
    return new Promise<T>((resolve, reject) => {
      this.pending.set(jobId, { resolve: resolve as (v: unknown) => void, reject, onProgress })
      this.ensureWorker().postMessage({ ...req, jobId } as WorkerRequest)
    })
  }

  compileScene(settings: SceneSettings, onProgress?: ProgressListener): Promise<SceneSnapshot> {
    return this.run({ type: 'compileScene', settings }, onProgress)
  }

  compileDrawing(scene: SceneSnapshot, options: Partial<DrawingOptions>, onProgress?: ProgressListener): Promise<DrawingResult> {
    return this.run({ type: 'compileDrawing', scene, options }, onProgress)
  }

  /** Abort every running job. */
  cancel(): void {
    this.worker?.terminate()
    this.worker = null
    for (const p of this.pending.values()) p.reject(new JobCancelledError())
    this.pending.clear()
  }

  dispose(): void {
    this.cancel()
  }
}
