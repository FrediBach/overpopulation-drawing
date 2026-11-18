import { useRef } from 'react'
import { Dices, FolderOpen, PenLine, Save, Sparkles, Download } from 'lucide-react'
import { PAPER_PROFILES, POSTURES, type Posture, type SceneSettings } from '@/core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { SliderField } from './SliderField'

const POSTURE_LABELS: Record<Posture, string> = {
  lyingBack: 'Lying on back',
  lyingFront: 'Lying on stomach',
  sitting: 'Sitting',
  reclining: 'Reclining',
  standing: 'Standing',
}

const pct = (v: number) => `${Math.round(v * 100)}%`

interface ControlsPanelProps {
  settings: SceneSettings
  details: boolean
  busy: boolean
  hasScene: boolean
  hasDrawing: boolean
  onSettings: (patch: Partial<SceneSettings>) => void
  onDetails: (v: boolean) => void
  onGenerate: () => void
  onComputeLines: () => void
  onExportSvg: () => void
  onSaveScene: () => void
  onLoadScene: (file: File) => void
}

export function ControlsPanel(props: ControlsPanelProps) {
  const { settings, onSettings, busy } = props
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-col gap-5 p-4">
      <section className="grid gap-4">
        <h2 className="text-sm font-semibold">Population</h2>
        <SliderField
          label="Requested people"
          value={settings.population}
          min={12}
          max={3000}
          step={1}
          onChange={(population) => onSettings({ population })}
        />
        <SliderField label="Crowding" value={settings.crowding} min={0} max={1} step={0.01} format={pct} onChange={(crowding) => onSettings({ crowding })} />
        <SliderField label="Motif share" value={settings.motifShare} min={0} max={1} step={0.01} format={pct} onChange={(motifShare) => onSettings({ motifShare })} />
        <SliderField label="Children" value={settings.childShare} min={0} max={0.4} step={0.01} format={pct} onChange={(childShare) => onSettings({ childShare })} />
        <div className="grid gap-2">
          <Label htmlFor="seed" className="text-xs text-muted-foreground">
            Seed
          </Label>
          <div className="flex gap-2">
            <Input
              id="seed"
              type="number"
              value={settings.seed}
              onChange={(e) => onSettings({ seed: Number(e.target.value) || 0 })}
            />
            <Button
              variant="outline"
              size="icon"
              aria-label="Random seed"
              onClick={() => onSettings({ seed: Math.floor(Math.random() * 100000) })}
            >
              <Dices />
            </Button>
          </div>
        </div>
      </section>

      <Separator />

      <section className="grid gap-4">
        <h2 className="text-sm font-semibold">Posture mix</h2>
        {POSTURES.map((p) => (
          <SliderField
            key={p}
            label={POSTURE_LABELS[p]}
            value={settings.postureMix[p]}
            min={0}
            max={5}
            step={0.5}
            onChange={(v) => onSettings({ postureMix: { ...settings.postureMix, [p]: v } })}
          />
        ))}
      </section>

      <Separator />

      <section className="grid gap-4">
        <h2 className="text-sm font-semibold">Paper & camera</h2>
        <div className="grid gap-2">
          <Label className="text-xs text-muted-foreground">Paper</Label>
          <Select value={settings.paperId} onValueChange={(paperId) => onSettings({ paperId })}>
            <SelectTrigger className="w-full" aria-label="Paper">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAPER_PROFILES.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label} · {p.penWidthMm} mm pen
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <SliderField
          label="Camera elevation"
          value={settings.elevationDeg}
          min={30}
          max={85}
          format={(v) => `${v}°`}
          onChange={(elevationDeg) => onSettings({ elevationDeg })}
        />
        <div className="flex items-center justify-between">
          <Label htmlFor="details" className="text-xs text-muted-foreground">
            Swimwear & hair lines
          </Label>
          <Switch id="details" checked={props.details} onCheckedChange={props.onDetails} />
        </div>
      </section>

      <Separator />

      <section className="grid gap-2">
        <Button onClick={props.onGenerate} disabled={busy}>
          <Sparkles /> Generate scene
        </Button>
        <Button variant="secondary" onClick={props.onComputeLines} disabled={busy || !props.hasScene}>
          <PenLine /> Compute pen lines
        </Button>
        <Button variant="outline" onClick={props.onExportSvg} disabled={!props.hasDrawing}>
          <Download /> Export SVG + report
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={props.onSaveScene} disabled={!props.hasScene}>
            <Save /> Save scene
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
            <FolderOpen /> Open
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          aria-label="Open scene file"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) props.onLoadScene(file)
            e.target.value = ''
          }}
        />
      </section>
    </div>
  )
}
