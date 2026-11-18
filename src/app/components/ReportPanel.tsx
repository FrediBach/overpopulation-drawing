import type { DrawingResult, SceneSnapshot } from '@/core'
import { Badge } from '@/components/ui/badge'

function Row({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5 text-xs" title={hint}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  )
}

const fmtInt = (n: number) => n.toLocaleString('en-US')
const fmtMs = (ms: number) => (ms > 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`)

/** Population accounting is reported in stages so hidden bodies never inflate the claim (plan §2). */
export function ReportPanel({ scene, drawing }: { scene: SceneSnapshot | null; drawing: DrawingResult | null }) {
  if (!scene) return <p className="text-xs text-muted-foreground">No scene yet.</p>
  const p = drawing?.report.population
  const v = scene.validation
  const lines = drawing?.report.lines
  return (
    <div className="grid gap-4">
      <section>
        <h3 className="mb-1 text-xs font-semibold tracking-wide uppercase">Population</h3>
        <Row label="Requested" value={fmtInt(scene.stats.requested)} />
        <Row label="Valid placed" value={fmtInt(scene.people.length - v.invalidPeople.length)} />
        <Row label="In frame" value={p ? fmtInt(p.inFrame) : '—'} />
        <Row
          label="Contributing strokes"
          value={p ? fmtInt(p.contributing) : '—'}
          hint={drawing ? `≥ ${drawing.report.thresholds.contributingMm} mm of visible ink` : undefined}
        />
        <Row
          label="Recognisable"
          value={p ? fmtInt(p.recognisable) : '—'}
          hint={drawing ? `head ≥ ${drawing.report.thresholds.recognisableHeadMm} mm and body ≥ ${drawing.report.thresholds.recognisableBodyMm} mm` : undefined}
        />
        {scene.stats.placed < scene.stats.requested && (
          <p className="mt-1 text-xs text-amber-700">
            Shortfall of {scene.stats.requested - scene.stats.placed}: no valid fit found. Lower crowding or change the posture mix.
          </p>
        )}
      </section>
      <section>
        <h3 className="mb-1 text-xs font-semibold tracking-wide uppercase">Validation</h3>
        <div className="mb-1 flex gap-1">
          {v.failures.length === 0 ? <Badge variant="secondary">All checks pass</Badge> : <Badge variant="destructive">{v.failures.length} failures</Badge>}
        </div>
        <Row label="Touching pairs" value={fmtInt(scene.relationships.filter((r) => r.kind === 'touch').length)} />
        <Row label="Near pairs" value={fmtInt(scene.relationships.filter((r) => r.kind === 'near').length)} />
        <Row label="Accommodations" value={fmtInt(scene.stats.accommodations)} hint="Limb variant switched to make room" />
        <Row label="Motif groups" value={fmtInt(scene.stats.motifInstances)} />
        <Row label="Rejected candidates" value={fmtInt(scene.stats.rejectedCandidates)} />
        <Row label="Scene time" value={fmtMs(scene.stats.timingMs)} />
        {v.failures.slice(0, 5).map((f) => (
          <p key={`${f.kind}-${f.personId}-${f.otherId ?? ''}-${f.detail}`} className="text-xs text-destructive">
            #{f.personId} {f.kind}: {f.detail}
          </p>
        ))}
      </section>
      {drawing && lines && (
        <section>
          <h3 className="mb-1 text-xs font-semibold tracking-wide uppercase">Plot</h3>
          <Row label="Scale" value={`${drawing.report.mmPerMetre.toFixed(1)} mm/m`} />
          <Row label="Strokes / pen lifts" value={fmtInt(lines.strokeCount)} />
          <Row label="Ink length" value={`${(lines.drawLengthMm / 1000).toFixed(1)} m`} />
          <Row label="Travel length" value={`${(lines.travelLengthMm / 1000).toFixed(1)} m`} />
          <Row label="· contours" value={`${(lines.lengthByClassMm.contour / 1000).toFixed(1)} m`} />
          <Row label="· details" value={`${(lines.lengthByClassMm.feature / 1000).toFixed(1)} m`} />
          <Row label="· environment" value={`${(lines.lengthByClassMm.environment / 1000).toFixed(1)} m`} />
          <Row label="Est. duration" value={`${(lines.estimatedDurationS / 3600).toFixed(1)} h`} hint="30 mm/s draw, 80 mm/s travel, 0.2 s per lift" />
          <Row label="Triangles" value={fmtInt(drawing.report.geometry.triangles)} />
          <Row label="Line time" value={fmtMs(drawing.report.timingMs.total)} />
        </section>
      )}
    </div>
  )
}
