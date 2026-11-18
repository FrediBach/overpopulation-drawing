import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { parseScene, serializeScene, snapshotHash, strokesToSvg } from '@/core'
import { JobCancelledError, PipelineClient } from '@/workers/pipelineClient'
import { downloadText } from '../lib/download'
import { initialStudioState, studioReducer, type StudioState } from './studioState'

export interface StudioActions {
  dispatch: React.Dispatch<Parameters<typeof studioReducer>[1]>
  generate(): void
  computeLines(): void
  cancel(): void
  exportSvg(): void
  saveScene(): void
  loadScene(file: File): void
}

/** Owns the pipeline worker and exposes studio state plus high-level actions. */
export function useStudio(createClient: () => PipelineClient = () => new PipelineClient()): [StudioState, StudioActions] {
  const [state, dispatch] = useReducer(studioReducer, initialStudioState)
  const clientRef = useRef<PipelineClient | null>(null)
  const createRef = useRef(createClient)
  const stateRef = useRef(state)

  useEffect(() => {
    stateRef.current = state
  })

  useEffect(() => {
    const client = createRef.current()
    clientRef.current = client
    return () => {
      client.dispose()
      clientRef.current = null
    }
  }, [])

  const onProgress = useCallback((fraction: number, label: string) => dispatch({ type: 'jobProgress', fraction, label }), [])

  const handleError = useCallback((err: unknown) => {
    if (err instanceof JobCancelledError) dispatch({ type: 'jobCancelled' })
    else dispatch({ type: 'jobFailed', message: err instanceof Error ? err.message : String(err) })
  }, [])

  const actions = useMemo<StudioActions>(
    () => ({
      dispatch,
      generate() {
        const client = clientRef.current
        if (!client) return
        client.cancel()
        dispatch({ type: 'jobStarted', kind: 'scene', label: 'Placing people' })
        client
          .compileScene(stateRef.current.settings, onProgress)
          .then((scene) => dispatch({ type: 'sceneReady', scene }))
          .catch(handleError)
      },
      computeLines() {
        const client = clientRef.current
        const { scene, details } = stateRef.current
        if (!client || !scene) return
        client.cancel()
        dispatch({ type: 'jobStarted', kind: 'drawing', label: 'Extracting contours' })
        client
          .compileDrawing(scene, { details }, onProgress)
          .then((drawing) => dispatch({ type: 'drawingReady', drawing }))
          .catch(handleError)
      },
      cancel() {
        clientRef.current?.cancel()
      },
      exportSvg() {
        const { scene, drawing } = stateRef.current
        if (!scene || !drawing) return
        const hash = snapshotHash(serializeScene(scene))
        const svg = strokesToSvg(drawing.strokes, drawing.report.paper, { title: `Overpopulation beach ${hash}` })
        downloadText(`beach-${scene.settings.population}-s${scene.settings.seed}-${hash}.svg`, svg, 'image/svg+xml')
        downloadText(
          `beach-${scene.settings.population}-s${scene.settings.seed}-${hash}.report.json`,
          JSON.stringify({ snapshot: hash, scene: scene.stats, ...drawing.report }, null, 2),
          'application/json',
        )
      },
      saveScene() {
        const { scene } = stateRef.current
        if (!scene) return
        const json = serializeScene(scene)
        downloadText(`beach-${scene.settings.population}-s${scene.settings.seed}-${snapshotHash(json)}.scene.json`, json, 'application/json')
      },
      loadScene(file: File) {
        file
          .text()
          .then((text) => dispatch({ type: 'sceneReady', scene: parseScene(text) }))
          .catch(handleError)
      },
    }),
    [handleError, onProgress],
  )

  return [state, actions]
}
