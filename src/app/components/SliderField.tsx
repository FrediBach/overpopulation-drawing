import { useId } from 'react'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'

interface SliderFieldProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  format?: (v: number) => string
  onChange: (v: number) => void
  disabled?: boolean
}

export function SliderField({ label, value, min, max, step = 1, format = String, onChange, disabled }: SliderFieldProps) {
  const id = useId()
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-xs text-muted-foreground">
          {label}
        </Label>
        <span className="font-mono text-xs tabular-nums">{format(value)}</span>
      </div>
      <Slider
        id={id}
        aria-label={label}
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  )
}
