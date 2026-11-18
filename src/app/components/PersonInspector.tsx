import { ARCHETYPES, MOTIF_BY_ID, type DrawingResult, type SceneSnapshot } from '@/core'
import { Badge } from '@/components/ui/badge'

export function PersonInspector({ scene, drawing, id }: { scene: SceneSnapshot; drawing: DrawingResult | null; id: number }) {
  const person = scene.people[id]
  if (!person) return null
  const body = scene.bodies[person.bodyIndex]
  const failures = scene.validation.failures.filter((f) => f.personId === id || f.otherId === id)
  const contacts = scene.relationships.filter((r) => r.a === id || r.b === id)
  const ink = drawing?.visibleMmByPerson[id]
  const limbs = person.pose ? Object.entries(person.pose.limbs).map(([limb, l]) => `${limb} ${l.mode}`) : ['blended pose']
  return (
    <div className="grid gap-1 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-semibold">Person #{person.id}</span>
        {person.accommodated && <Badge variant="outline">accommodated</Badge>}
        {failures.length > 0 && <Badge variant="destructive">invalid</Badge>}
      </div>
      <div className="text-muted-foreground">
        {ARCHETYPES[person.posture].label} · {person.outfit}
      </div>
      <div className="text-muted-foreground">{limbs.join(' · ')}</div>
      <div className="text-muted-foreground">
        Body: height {body.height.toFixed(2)}, mass {body.mass.toFixed(2)}, muscle {body.muscle.toFixed(2)}, fem {body.femininity.toFixed(2)}
        {body.child > 0 ? `, child ${body.child.toFixed(2)}` : ''}
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
