import { BODY_VARIANT_BY_ID, MOTIF_BY_ID, POSE_FAMILY_BY_ID, type DrawingResult, type SceneSnapshot } from '@/core'
import { Badge } from '@/components/ui/badge'

export function PersonInspector({ scene, drawing, id }: { scene: SceneSnapshot; drawing: DrawingResult | null; id: number }) {
  const person = scene.people[id]
  if (!person) return null
  const family = POSE_FAMILY_BY_ID[person.family]
  const failures = scene.validation.failures.filter((f) => f.personId === id || f.otherId === id)
  const contacts = scene.relationships.filter((r) => r.a === id || r.b === id)
  const ink = drawing?.visibleMmByPerson[id]
  return (
    <div className="grid gap-1 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-semibold">Person #{person.id}</span>
        {person.accommodated && <Badge variant="outline">accommodated</Badge>}
        {failures.length > 0 && <Badge variant="destructive">invalid</Badge>}
      </div>
      <div className="text-muted-foreground">
        {family.label} · {person.variant} · {BODY_VARIANT_BY_ID[person.bodyVariant]?.label} · {person.outfit}
      </div>
      {person.motifId && <div className="text-muted-foreground">Motif: {MOTIF_BY_ID[person.motifId]?.label} (group {person.groupId})</div>}
      <div className="text-muted-foreground">
        Contacts: {contacts.filter((c) => c.kind === 'touch').length} touching, {contacts.filter((c) => c.kind === 'near').length} near
      </div>
      {ink !== undefined && <div className="text-muted-foreground">Visible ink: {ink.toFixed(1)} mm</div>}
      {failures.map((f) => (
        <div key={`${f.kind}-${f.personId}-${f.otherId ?? ''}-${f.detail}`} className="text-destructive">
          {f.kind}: {f.detail}
        </div>
      ))}
    </div>
  )
}
