import { Vector3 } from 'three'
import { getBodySkeleton } from '../body/asset'
import { REFERENCE_BODY, type BodyParams } from '../body/params'
import { createRng } from '../math/rng'
import { ARCHETYPES } from './archetypes'
import { blendGoals, buildPose, generateValidPose, mutatePoseParams, samplePoseParams, solveGoals } from './generate'
import { solveTwoBone } from './ik'
import { Poser } from './poser'
import { POSTURES } from './types'

const BODIES: Record<string, BodyParams> = {
  reference: REFERENCE_BODY,
  heavy: { height: 0.97, mass: 0.95, muscle: 0.3, femininity: 0.2, child: 0 },
  child: { height: 0.68, mass: 0.3, muscle: 0.2, femininity: 0.6, child: 0.9 },
}

describe('two-bone IK', () => {
  it('reaches a reachable target and bends the elbow toward the pole side', () => {
    const sk = getBodySkeleton(REFERENCE_BODY)
    const poser = new Poser(sk)
    const target = poser.position('upperArm.L').add(new Vector3(0.15, -0.2, 0.3))
    solveTwoBone(poser, 'upperArm.L', 'foreArm.L', 'hand.L', target, new Vector3(0, 0, -1), -1)
    expect(poser.position('hand.L').distanceTo(target)).toBeLessThan(1e-3)
    // Elbow points backwards (towards the pole).
    expect(poser.position('foreArm.L').z).toBeLessThan(target.z)
  })
})

describe('pose generator', () => {
  it.each(Object.entries(BODIES))('generates valid poses for every posture (%s body)', (_name, body) => {
    const sk = getBodySkeleton(body)
    const rng = createRng(11)
    for (const posture of POSTURES) {
      const g = generateValidPose(sk, posture, rng, 60)
      expect(g, posture).not.toBeNull()
      expect(g!.result.problems).toEqual([])
    }
  })

  it.each([...POSTURES])('%s yields valid poses at a usable rate', (posture) => {
    const sk = getBodySkeleton(REFERENCE_BODY)
    const rng = createRng(5)
    let ok = 0
    for (let i = 0; i < 60; i++) if (buildPose(sk, samplePoseParams(posture, rng)).problems.length === 0) ok++
    expect(ok / 60).toBeGreaterThan(0.2)
  })

  it('produces distinct poses from distinct parameters', () => {
    const sk = getBodySkeleton(REFERENCE_BODY)
    const rng = createRng(2)
    const a = generateValidPose(sk, 'sitting', rng)!
    const b = generateValidPose(sk, 'sitting', rng)!
    expect(a.result.joints).not.toEqual(b.result.joints)
  })

  it('is deterministic for the same parameters', () => {
    const sk = getBodySkeleton(REFERENCE_BODY)
    const p = samplePoseParams('lyingSide', createRng(3))
    expect(buildPose(sk, p).joints).toEqual(buildPose(sk, p).joints)
  })

  it('blends goals continuously with exact endpoints', () => {
    const sk = getBodySkeleton(REFERENCE_BODY)
    const rng = createRng(4)
    const a = generateValidPose(sk, 'sitting', rng)!.result
    const b = generateValidPose(sk, 'standing', rng)!.result
    for (const [t, ref] of [[0, a], [1, b]] as const) {
      const got = solveGoals(sk, blendGoals(a.goals, b.goals, t)).joints
      for (const bone of Object.keys(ref.joints) as (keyof typeof ref.joints)[]) {
        ref.joints[bone]!.forEach((v, i) => expect(got[bone]![i]).toBeCloseTo(v, 6))
      }
    }
    const mid = solveGoals(sk, blendGoals(a.goals, b.goals, 0.5))
    expect(mid.joints).not.toEqual(a.joints)
    expect(mid.joints).not.toEqual(b.joints)
  })

  it('mutates continuously while keeping the posture', () => {
    const sk = getBodySkeleton(REFERENCE_BODY)
    const rng = createRng(8)
    const g = generateValidPose(sk, 'lyingBack', rng)!
    const m = mutatePoseParams(g.params, rng, 0.2, ['armL'])
    expect(m.posture).toBe('lyingBack')
    expect(m.limbs.legL).toEqual(g.params.limbs.legL)
    expect(m.limbs.armL).not.toEqual(g.params.limbs.armL)
  })

  it('only uses limb modes that exist for each archetype', () => {
    for (const a of Object.values(ARCHETYPES)) {
      const rng = createRng(1)
      for (let i = 0; i < 20; i++) {
        const p = samplePoseParams(a.posture, rng)
        expect(() => buildPose(getBodySkeleton(REFERENCE_BODY), p)).not.toThrow()
      }
    }
  })
})
