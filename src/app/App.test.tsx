// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { buildPreviewBatch, compileDrawing, synthesizeScene, type DrawingOptions, type SceneSettings, type SceneSnapshot } from '@/core'
import type { PipelineClient } from '@/workers/pipelineClient'
import { App } from './App'

// WebGL is not available in jsdom; the viewport is covered by the e2e test.
vi.mock('./components/ShadedViewport', () => ({
  ShadedViewport: () => <div data-testid="shaded-viewport" />,
}))

/** Runs the pipeline synchronously in-process instead of in a worker. */
function fakeClient(): PipelineClient {
  return {
    compileScene: async (settings: SceneSettings) => {
      const scene = synthesizeScene({ ...settings, population: 12, bodyVariety: 3 })
      return { scene, preview: buildPreviewBatch(scene) }
    },
    compileDrawing: async (scene: SceneSnapshot, options: Partial<DrawingOptions>) => compileDrawing(scene, options),
    cancel: () => {},
    dispose: () => {},
  } as unknown as PipelineClient
}

describe('App', () => {
  it('generates a scene and computes pen lines', async () => {
    const user = userEvent.setup()
    render(<App createClient={fakeClient} />)
    expect(screen.getByRole('button', { name: /compute pen lines/i })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: /generate scene/i }))
    await waitFor(() => expect(screen.getByText('All checks pass')).toBeInTheDocument(), { timeout: 30_000 })
    expect(screen.getByRole('button', { name: /compute pen lines/i })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: /compute pen lines/i }))
    await waitFor(() => expect(screen.getByText('Ink length')).toBeInTheDocument(), { timeout: 30_000 })
    expect(screen.getByRole('button', { name: /export svg/i })).toBeEnabled()
  }, 60_000)
})
