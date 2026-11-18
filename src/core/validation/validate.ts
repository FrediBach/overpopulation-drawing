import { capsuleBounds, capsuleDistance, CollisionWorld } from '../constraints/collision'
import { findJointLimitViolations } from '../constraints/jointLimits'
import type { Capsule } from '../poses/fk'
import { isInWater } from '../synthesis/composition'
import type {
  BeachLayout,
  PersonRecord,
  Relationship,
  ValidationFailure,
  ValidationReport,
} from '../scene/types'

export interface ValidationOptions {
  /** Allowed proxy overlap before a pair is reported, metres. */
  penetrationTolerance: number
  /** Allowed sinking below the ground, metres. */
  groundTolerance: number
  /** Surface distance under which two people are considered touching. */
  touchDistance: number
  /** Surface distance under which two people are considered near. */
  nearDistance: number
}

export const DEFAULT_VALIDATION: ValidationOptions = {
  penetrationTolerance: 0.003,
  groundTolerance: 0.002,
  touchDistance: 0.025,
  nearDistance: 0.08,
}

/**
 * Independent acceptance pass over every placed person (plan §7 Stage E):
 * returns explicit per-person failures rather than an aggregate score,
 * plus the contact relationships that emerged.
 *
 * Not yet covered (documented POC limits): mesh-level surface checks,
 * self-intersection and containment tests.
 */
export function validateScene(
  people: PersonRecord[],
  capsules: Capsule[][],
  layout: BeachLayout,
  opts: ValidationOptions = DEFAULT_VALIDATION,
): { report: ValidationReport; relationships: Relationship[] } {
  const failures: ValidationFailure[] = []
  const world = new CollisionWorld(0.5)
  const best = new Map<string, Relationship>()

  people.forEach((person, i) => {
    const caps = capsules[i]
    for (const v of findJointLimitViolations(person.joints)) {
      failures.push({
        personId: person.id,
        kind: 'joint-limit',
        detail: `${v.bone} axis ${'XYZ'[v.axis]} = ${v.value.toFixed(1)}° outside [${v.limit[0]}, ${v.limit[1]}]`,
      })
    }
    let lowest = Infinity
    for (const c of caps) lowest = Math.min(lowest, capsuleBounds(c).min[1] + c.radius - groundSupportLower(c))
    if (lowest < -opts.groundTolerance) {
      failures.push({ personId: person.id, kind: 'ground', detail: `Body sinks ${(-lowest * 1000).toFixed(1)} mm into the sand`, magnitude: -lowest })
    }
    if (isInWater(layout, person.x, person.z)) {
      failures.push({ personId: person.id, kind: 'water', detail: 'Body centre is in the water' })
    }
    const reported = new Set<number>()
    for (const c of caps) {
      const { min, max } = capsuleBounds(c)
      for (let k = 0; k < 3; k++) {
        min[k] -= opts.nearDistance
        max[k] += opts.nearDistance
      }
      world.forEachNear(min, max, (other) => {
        const d = capsuleDistance(c, other.capsule)
        if (d < -opts.penetrationTolerance && !reported.has(other.personId)) {
          reported.add(other.personId)
          failures.push({
            personId: person.id,
            otherId: other.personId,
            kind: 'penetration',
            detail: `${c.bone} overlaps person ${other.personId} ${other.capsule.bone} by ${(-d * 1000).toFixed(1)} mm`,
            magnitude: -d,
          })
        }
        if (d < opts.nearDistance) {
          const key = `${other.personId}:${person.id}`
          const prev = best.get(key)
          if (!prev || d < prev.distance) {
            best.set(key, {
              a: other.personId,
              b: person.id,
              kind: d < opts.touchDistance ? 'touch' : 'near',
              boneA: other.capsule.bone,
              boneB: c.bone,
              distance: d,
            })
          }
        }
      })
    }
    world.add(person.id, caps)
  })

  const invalid = new Set<number>()
  for (const f of failures) {
    invalid.add(f.personId)
  }
  return {
    report: {
      checkedPeople: people.length,
      failures,
      invalidPeople: [...invalid].sort((a, b) => a - b),
      penetrationTolerance: opts.penetrationTolerance,
    },
    relationships: [...best.values()],
  }
}

/** Distance from the lowest proxy point to the actual ellipsoid bottom. */
function groundSupportLower(c: Capsule): number {
  return Math.sqrt((c.rx * c.ax[1]) ** 2 + (c.rcap * c.ay[1]) ** 2 + (c.rz * c.az[1]) ** 2)
}
