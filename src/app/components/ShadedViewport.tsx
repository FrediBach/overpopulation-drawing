import { useEffect, useRef } from 'react'
import type { SceneSnapshot } from '@/core'
import { CrowdPreview, type PreviewOverlay } from '@/preview/CrowdPreview'

interface ShadedViewportProps {
  scene: SceneSnapshot | null
  overlay: PreviewOverlay
  onPick: (id: number | null) => void
  /** Increment to snap the view back to the print camera. */
  resetToken: number
}

export function ShadedViewport({ scene, overlay, onPick, resetToken }: ShadedViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<CrowdPreview | null>(null)
  const onPickRef = useRef(onPick)

  useEffect(() => {
    onPickRef.current = onPick
  })

  useEffect(() => {
    const preview = new CrowdPreview(containerRef.current!)
    preview.onPick = (id) => onPickRef.current(id)
    previewRef.current = preview
    return () => {
      preview.dispose()
      previewRef.current = null
    }
  }, [])

  useEffect(() => {
    previewRef.current?.setScene(scene)
  }, [scene])

  useEffect(() => {
    previewRef.current?.setOverlay(overlay)
  }, [overlay, scene])

  useEffect(() => {
    previewRef.current?.resetToPrintCamera()
  }, [resetToken])

  return <div ref={containerRef} className="size-full" data-testid="shaded-viewport" />
}
