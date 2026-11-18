import { useMemo, useState } from 'react'
import { Crosshair, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { ColorMode } from '@/preview/colors'
import type { PipelineClient } from '@/workers/pipelineClient'
import { ControlsPanel } from './components/ControlsPanel'
import { LabPanel } from './components/LabPanel'
import { LinesView } from './components/LinesView'
import { PersonInspector } from './components/PersonInspector'
import { ReportPanel } from './components/ReportPanel'
import { ShadedViewport } from './components/ShadedViewport'
import { useStudio } from './state/useStudio'
import type { StudioMode, ViewTab } from './state/studioState'

const COLOR_MODES: { value: ColorMode; label: string }[] = [
  { value: 'person', label: 'Colour: person' },
  { value: 'posture', label: 'Colour: posture' },
  { value: 'validity', label: 'Colour: validation' },
  { value: 'visibility', label: 'Colour: hidden people' },
]

export function App({ createClient }: { createClient?: () => PipelineClient }) {
  const [state, actions] = useStudio(createClient)
  const { dispatch } = actions
  const [resetToken, setResetToken] = useState(0)
  const busy = state.job !== null

  const overlay = useMemo(
    () => ({
      colorMode: state.colorMode,
      selectedId: state.selectedId,
      visibleMm: state.drawing?.visibleMmByPerson ?? null,
      contributingMm: state.drawing?.report.thresholds.contributingMm,
    }),
    [state.colorMode, state.selectedId, state.drawing],
  )

  return (
    <TooltipProvider>
      <div className="grid h-screen grid-cols-[18rem_1fr_17rem] bg-background text-foreground">
        <aside className="overflow-y-auto border-r">
          <header className="grid gap-3 px-4 pt-4">
            <div>
              <h1 className="text-base font-semibold">Overpopulation Beach</h1>
              <p className="text-xs text-muted-foreground">Crowd scene → pen-plotter drawing</p>
            </div>
            <Tabs value={state.mode} onValueChange={(mode) => dispatch({ type: 'setMode', mode: mode as StudioMode })}>
              <TabsList className="w-full">
                <TabsTrigger value="crowd">Crowd</TabsTrigger>
                <TabsTrigger value="lab">Pose lab</TabsTrigger>
              </TabsList>
            </Tabs>
          </header>
          {state.mode === 'lab' ? (
            <LabPanel lab={state.lab} busy={busy} onLab={(patch) => dispatch({ type: 'updateLab', patch })} onGenerate={actions.generateLab} />
          ) : (
          <ControlsPanel
            settings={state.settings}
            details={state.details}
            busy={busy}
            hasScene={!!state.scene}
            hasDrawing={!!state.drawing}
            onSettings={(patch) => dispatch({ type: 'updateSettings', patch })}
            onDetails={(details) => dispatch({ type: 'setDetails', details })}
            onGenerate={actions.generate}
            onComputeLines={actions.computeLines}
            onExportSvg={actions.exportSvg}
            onSaveScene={actions.saveScene}
            onLoadScene={actions.loadScene}
          />
          )}
          {state.mode === 'lab' && (
            <div className="grid gap-2 px-4 pb-4">
              <Button variant="secondary" onClick={actions.computeLines} disabled={busy || !state.scene}>
                Compute pen lines
              </Button>
              <Button variant="outline" onClick={actions.exportSvg} disabled={!state.drawing}>
                Export SVG + report
              </Button>
            </div>
          )}
        </aside>

        <main className="flex min-w-0 flex-col">
          <Tabs
            value={state.tab}
            onValueChange={(tab) => dispatch({ type: 'setTab', tab: tab as ViewTab })}
            className="flex min-h-0 flex-1 flex-col gap-0"
          >
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <TabsList>
                <TabsTrigger value="shaded">Shaded</TabsTrigger>
                <TabsTrigger value="lines">Pen lines</TabsTrigger>
              </TabsList>
              {state.tab === 'shaded' && (
                <>
                  <Select value={state.colorMode} onValueChange={(mode) => dispatch({ type: 'setColorMode', mode: mode as ColorMode })}>
                    <SelectTrigger size="sm" className="w-48" aria-label="Colour mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COLOR_MODES.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="sm" onClick={() => setResetToken((t) => t + 1)}>
                    <Crosshair /> Print camera
                  </Button>
                </>
              )}
              <div className="ml-auto flex min-w-0 items-center gap-2">
                {state.job && (
                  <>
                    <span className="truncate text-xs text-muted-foreground">{state.job.label}</span>
                    <Progress value={state.job.fraction * 100} className="w-32" />
                    <Button variant="ghost" size="icon-sm" aria-label="Cancel job" onClick={actions.cancel}>
                      <X />
                    </Button>
                  </>
                )}
              </div>
            </div>
            {state.error && (
              <div role="alert" className="flex items-center justify-between bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
                {state.error}
                <Button variant="ghost" size="xs" onClick={() => dispatch({ type: 'dismissError' })}>
                  Dismiss
                </Button>
              </div>
            )}
            <TabsContent value="shaded" forceMount className="relative min-h-0 flex-1 data-[state=inactive]:hidden">
              <ShadedViewport
                scene={state.scene}
                preview={state.preview}
                overlay={overlay}
                resetToken={resetToken}
                onPick={(id) => dispatch({ type: 'select', id })}
              />
              {!state.scene && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                  Press “Generate scene” to populate the beach.
                </div>
              )}
            </TabsContent>
            <TabsContent value="lines" className="min-h-0 flex-1">
              <LinesView drawing={state.drawing} />
            </TabsContent>
          </Tabs>
        </main>

        <aside className="overflow-y-auto border-l p-4">
          {state.scene && state.selectedId !== null && (
            <div className="mb-4 rounded-md border p-2">
              <PersonInspector scene={state.scene} drawing={state.drawing} id={state.selectedId} />
            </div>
          )}
          <ReportPanel scene={state.scene} drawing={state.drawing} />
        </aside>
      </div>
    </TooltipProvider>
  )
}
