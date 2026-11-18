import { Dices, Sparkles } from 'lucide-react'
import { ARCHETYPES, POSTURES, REFERENCE_BODY, type BodyParams, type LabSettings, type Posture } from '@/core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SliderField } from './SliderField'

interface LabPanelProps {
  lab: LabSettings
  busy: boolean
  onLab: (patch: Partial<LabSettings>) => void
  onGenerate: () => void
}

const BODY_SLIDERS: { key: keyof BodyParams; label: string; min: number; max: number }[] = [
  { key: 'height', label: 'Height', min: 0.6, max: 1.15 },
  { key: 'mass', label: 'Mass', min: 0, max: 1 },
  { key: 'muscle', label: 'Muscle', min: 0, max: 1 },
  { key: 'femininity', label: 'Femininity', min: 0, max: 1 },
  { key: 'child', label: 'Child', min: 0, max: 1 },
]

function PostureSelect({ value, onChange, label, allowAll }: { value: string; onChange: (v: string) => void; label: string; allowAll?: boolean }) {
  return (
    <div className="grid gap-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allowAll && <SelectItem value="all">All postures</SelectItem>}
          {POSTURES.map((p) => (
            <SelectItem key={p} value={p}>
              {ARCHETYPES[p].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** Study the pose generator: a gallery of sampled poses, or the in-betweens from pose A to pose B. */
export function LabPanel({ lab, busy, onLab, onGenerate }: LabPanelProps) {
  const body = lab.body === 'varied' ? null : lab.body
  return (
    <div className="flex flex-col gap-5 p-4">
      <Tabs
        value={lab.mode}
        onValueChange={(mode) =>
          onLab(mode === 'blend' && lab.posture === 'all' ? { mode: 'blend', posture: 'sitting' } : { mode: mode as LabSettings['mode'] })
        }
      >
        <TabsList className="w-full">
          <TabsTrigger value="gallery">Gallery</TabsTrigger>
          <TabsTrigger value="blend">In-between</TabsTrigger>
        </TabsList>
      </Tabs>
      <section className="grid gap-4">
        <PostureSelect
          label={lab.mode === 'blend' ? 'From posture' : 'Posture'}
          value={lab.posture}
          allowAll={lab.mode === 'gallery'}
          onChange={(v) => onLab({ posture: v as Posture | 'all' })}
        />
        {lab.mode === 'blend' && <PostureSelect label="To posture" value={lab.postureB} onChange={(v) => onLab({ postureB: v as Posture })} />}
        <SliderField
          label={lab.mode === 'blend' ? 'Steps' : 'Figures'}
          value={lab.count}
          min={2}
          max={40}
          onChange={(count) => onLab({ count })}
        />
        <div className="grid gap-2">
          <Label htmlFor="lab-seed" className="text-xs text-muted-foreground">
            Seed
          </Label>
          <div className="flex gap-2">
            <Input id="lab-seed" type="number" value={lab.seed} onChange={(e) => onLab({ seed: Number(e.target.value) || 0 })} />
            <Button variant="outline" size="icon" aria-label="Random lab seed" onClick={() => onLab({ seed: Math.floor(Math.random() * 100000) })}>
              <Dices />
            </Button>
          </div>
        </div>
      </section>
      <Separator />
      <section className="grid gap-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="varied" className="text-xs text-muted-foreground">
            Varied bodies
          </Label>
          <Switch id="varied" checked={!body} onCheckedChange={(v) => onLab({ body: v ? 'varied' : REFERENCE_BODY })} />
        </div>
        {body &&
          BODY_SLIDERS.map((s) => (
            <SliderField
              key={s.key}
              label={s.label}
              value={body[s.key]}
              min={s.min}
              max={s.max}
              step={0.01}
              format={(v) => v.toFixed(2)}
              onChange={(v) => onLab({ body: { ...body, [s.key]: v } })}
            />
          ))}
        <SliderField label="Camera elevation" value={lab.elevationDeg} min={10} max={85} format={(v) => `${v}°`} onChange={(elevationDeg) => onLab({ elevationDeg })} />
      </section>
      <Button onClick={onGenerate} disabled={busy}>
        <Sparkles /> Generate poses
      </Button>
    </div>
  )
}
