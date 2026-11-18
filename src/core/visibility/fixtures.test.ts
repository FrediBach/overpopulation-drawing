import { buildBodyMesh } from '../assets/bodyMesh'
import { EXPORT_RESOLUTION } from '../assets/capsuleTemplate'
import { createProjector, frameCamera } from '../camera/projection'
import { extractBodyLines } from '../contours/extract'
import type { CandidateSegment } from '../contours/types'
import type { Capsule } from '../poses/fk'
import { PAPER_BY_ID } from '../scene/paper'
import { visibleIntervals } from './hlr'
import { OccluderSet, TriangleGrid } from './occluders'

const capsule = (bone: Capsule['bone'], region: Capsule['region'], a: Capsule['a'], b: Capsule['b'], r: number): Capsule => {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const len = Math.hypot(d[0], d[1], d[2])
  const ay: Capsule['ay'] = [d[0] / len, d[1] / len, d[2] / len]
  // Any perpendicular basis is fine for a round cross-section.
  const ax: Capsule['ax'] = Math.abs(ay[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]
  const az: Capsule['az'] = [ax[1] * ay[2] - ax[2] * ay[1], ax[2] * ay[0] - ax[0] * ay[2], ax[0] * ay[1] - ax[1] * ay[0]]
  return { bone, region, a, b, ax, ay, az, rx: r, rz: r, rcap: r, radius: r }
}

/** Front view (elevation 0): camera looks along -Z, so larger z is closer. */
function solve(people: Capsule[][]) {
  const paper = PAPER_BY_ID.A3
  const projector = createProjector(frameCamera(paper, 0, 2), paper)
  const occ = new OccluderSet()
  const candidates: CandidateSegment[] = []
  let base = 0
  people.forEach((caps, owner) => {
    const mesh = buildBodyMesh(caps, EXPORT_RESOLUTION)
    extractBodyLines(mesh, owner, base, 'trunks', false, projector, occ, candidates)
    base += mesh.positions.length / 3
  })
  const grid = new TriangleGrid(occ, projector.drawRect, 2)
  const pieces = candidates.map((c) => ({ c, v: visibleIntervals(c, occ, grid) }))
  return { projector, pieces }
}

const visibleLength = (pieces: ReturnType<typeof solve>['pieces'], filter: (c: CandidateSegment) => boolean) =>
  pieces
    .filter((p) => filter(p.c))
    .reduce((s, p) => {
      const len = Math.hypot(p.c.u1 - p.c.u0, p.c.v1 - p.c.v0)
      let t = 0
      for (let i = 0; i < p.v.length; i += 2) t += p.v[i + 1] - p.v[i]
      return s + len * t
    }, 0)

describe('hidden-line fixtures', () => {
  it('an arm crossing its owner’s torso hides the torso contour behind it (plan fixture 2)', () => {
    const torso = capsule('chest', 'torso', [0, -0.4, 0], [0, 0.4, 0], 0.15)
    const arm = capsule('foreArm.L', 'arm', [-0.4, 0, 0.3], [0.4, 0, 0.3], 0.04)
    const { projector, pieces } = solve([[torso, arm]])
    const s = projector.mmPerMetre
    const cy = (projector.drawRect.y0 + projector.drawRect.y1) / 2
    // No visible torso contour inside the arm's projected band.
    for (const { c, v } of pieces.filter((p) => p.c.region === 'torso')) {
      for (let i = 0; i < v.length; i += 2) {
        const tm = (v[i] + v[i + 1]) / 2
        const y = c.v0 + (c.v1 - c.v0) * tm
        expect(Math.abs(y - cy)).toBeGreaterThan(0.035 * s)
      }
    }
    // The torso contour is broken into pieces rather than removed.
    expect(visibleLength(pieces, (c) => c.region === 'torso')).toBeGreaterThan(0.8 * 2 * 0.8 * s)
    // The arm in front is fully visible apart from where it meets nothing.
    const armTotal = pieces.filter((p) => p.c.region === 'arm').reduce((s2, p) => s2 + Math.hypot(p.c.u1 - p.c.u0, p.c.v1 - p.c.v0), 0)
    expect(visibleLength(pieces, (c) => c.region === 'arm')).toBeCloseTo(armTotal, 3)
  })

  it('interleaved forearms of two people keep a clear front and back (plan fixture 3)', () => {
    const front = capsule('foreArm.L', 'arm', [-0.4, -0.1, 0.2], [0.4, 0.1, 0.2], 0.04)
    const back = capsule('foreArm.R', 'arm', [-0.4, 0.1, 0], [0.4, -0.1, 0], 0.04)
    const { pieces } = solve([[front], [back]])
    const total = (owner: number) => pieces.filter((p) => p.c.owner === owner).reduce((s, p) => s + Math.hypot(p.c.u1 - p.c.u0, p.c.v1 - p.c.v0), 0)
    expect(visibleLength(pieces, (c) => c.owner === 0)).toBeCloseTo(total(0), 3)
    expect(visibleLength(pieces, (c) => c.owner === 1)).toBeLessThan(total(1) * 0.97)
    // Back arm keeps both ends.
    expect(visibleLength(pieces, (c) => c.owner === 1)).toBeGreaterThan(total(1) * 0.7)
  })
})
