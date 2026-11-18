import { useEffect, useMemo, useRef, useState } from 'react'
import { strokesToSvg, type DrawingResult } from '@/core'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

interface LinesViewProps {
  drawing: DrawingResult | null
}

/** Shows the exact SVG that will be exported, fitted or at nominal physical size. */
export function LinesView({ drawing }: LinesViewProps) {
  const [actualSize, setActualSize] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const svg = useMemo(() => (drawing ? strokesToSvg(drawing.strokes, drawing.report.paper) : null), [drawing])

  // The object URL is owned by this effect so it is revoked exactly once per SVG.
  useEffect(() => {
    const img = imgRef.current
    if (!svg || !img) return
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [svg])

  if (!drawing) {
    return (
      <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
        Generate a scene, then compute pen lines to preview the plot.
      </div>
    )
  }
  const { paper } = drawing.report
  return (
    <div className="relative size-full overflow-auto bg-neutral-200">
      <div className="sticky top-2 left-2 z-10 ml-2 inline-flex items-center gap-2 rounded-md bg-background/90 px-2 py-1 shadow-sm">
        <Switch id="actual-size" checked={actualSize} onCheckedChange={setActualSize} />
        <Label htmlFor="actual-size" className="text-xs">
          Actual size ({paper.widthMm}×{paper.heightMm} mm)
        </Label>
      </div>
      <div className="flex min-h-full items-start justify-center p-4">
        <img
          ref={imgRef}
          alt="Pen plot preview"
          className="bg-white shadow"
          style={actualSize ? { width: `${paper.widthMm}mm`, maxWidth: 'none' } : { width: '100%', maxWidth: '100%' }}
        />
      </div>
    </div>
  )
}
