import type { BoneSpec } from '../assets/skeleton'
import type { BodyAsset } from '../body/asset'
import { createProjector, frameCamera } from '../camera/projection'
import { extractBodyLines } from '../contours/extract'
import type { CandidateSegment } from '../contours/types'
import { surfaceNets } from '../mesh/surfaceNets'
import { buildTopology } from '../mesh/topology'
import { PAPER_BY_ID } from '../scene/paper'
import { visibleIntervals } from './hlr'
import { OccluderSet, TriangleGrid } from './occluders'

type V3 = [number, number, number]

function capsuleSdf(a: V3, b: V3, r: number) {
  return (x: number, y: number, z: number) => {
    const ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const pa = [x - a[0], y - a[1], z - a[2]]
    const t = Math.max(0, Math.min(1, (pa[0] * ba[0] + pa[1] * ba[1] + pa[2] * ba[2]) / (ba[0] ** 2 + ba[1] ** 2 + ba[2] ** 2)))
    return Math.hypot(pa[0] - ba[0] * t, pa[1] - ba[1] * t, pa[2] - ba[2] * t) - r
  }
}

/** A minimal asset from an SDF: region 'torso' for bone 0, 'arm' for bone 1 (chosen by `isArm`). */
function assetFrom(sdf: (x: number, y: number, z: number) => number, isArm: (x: number, y: number, z: number) => boolean): BodyAsset {
  const cell = 0.02
  const n = 60
  const origin: V3 = [-0.6, -0.6, -0.4]
  const values = new Float32Array(n * n * n)
  for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) values[i + n * (j + n * k)] = sdf(origin[0] + i * cell, origin[1] + j * cell, origin[2] + k * cell)
  const mesh = surfaceNets(values, { origin, cell, dims: [n, n, n] })
  const vcount = mesh.positions.length / 3
  const dominantBone = new Uint8Array(vcount)
  for (let v = 0; v < vcount; v++) dominantBone[v] = isArm(mesh.positions[v * 3], mesh.positions[v * 3 + 1], mesh.positions[v * 3 + 2]) ? 1 : 0
  const skeleton = [{ region: 'torso' }, { region: 'arm' }] as unknown as BoneSpec[]
  return { indices: mesh.indices, topology: buildTopology(mesh.indices, vcount), dominantBone, skeleton, restPositions: mesh.positions } as unknown as BodyAsset
}

/** Front view (elevation 0): camera looks along -Z, so larger z is closer. */
function solve(assets: BodyAsset[]) {
  const paper = PAPER_BY_ID.A3
  const projector = createProjector(frameCamera(paper, 0, 2), paper)
  const occ = new OccluderSet()
  const candidates: CandidateSegment[] = []
  let base = 0
  let keys = 0
  assets.forEach((asset, owner) => {
    const r = extractBodyLines(asset, asset.restPositions, owner, base, keys, [], projector, occ, candidates)
    base += asset.restPositions.length / 3
    keys += r.keysUsed
  })
  const grid = new TriangleGrid(occ, projector.drawRect, 2)
  return { projector, pieces: candidates.map((c) => ({ c, v: visibleIntervals(c, occ, grid) })) }
}

type Pieces = ReturnType<typeof solve>['pieces']
const total = (pieces: Pieces, f: (c: CandidateSegment) => boolean) => pieces.filter((p) => f(p.c)).reduce((s, p) => s + Math.hypot(p.c.u1 - p.c.u0, p.c.v1 - p.c.v0), 0)
const visible = (pieces: Pieces, f: (c: CandidateSegment) => boolean) =>
  pieces.filter((p) => f(p.c)).reduce((s, p) => {
    let t = 0
    for (let i = 0; i < p.v.length; i += 2) t += p.v[i + 1] - p.v[i]
    return s + Math.hypot(p.c.u1 - p.c.u0, p.c.v1 - p.c.v0) * t
  }, 0)

describe('hidden-line fixtures', () => {
  it('an arm crossing its owner’s torso hides the torso contour behind it (plan fixture 2)', () => {
    const torso = capsuleSdf([0, -0.4, 0], [0, 0.4, 0], 0.15)
    const arm = capsuleSdf([-0.4, 0, 0.3], [0.4, 0, 0.3], 0.04)
    const asset = assetFrom((x, y, z) => Math.min(torso(x, y, z), arm(x, y, z)), (_x, _y, z) => z > 0.2)
    const { projector, pieces } = solve([asset])
    const s = projector.mmPerMetre
    const cy = (projector.drawRect.y0 + projector.drawRect.y1) / 2
    for (const { c, v } of pieces.filter((p) => p.c.region === 'torso')) {
      for (let i = 0; i < v.length; i += 2) {
        const tm = (v[i] + v[i + 1]) / 2
        expect(Math.abs(c.v0 + (c.v1 - c.v0) * tm - cy)).toBeGreaterThan(0.035 * s)
      }
    }
    // The torso contour is broken, not removed; the arm in front stays fully visible.
    expect(visible(pieces, (c) => c.region === 'torso')).toBeGreaterThan(0.75 * total(pieces, (c) => c.region === 'torso'))
    expect(visible(pieces, (c) => c.region === 'arm')).toBeGreaterThan(0.97 * total(pieces, (c) => c.region === 'arm'))
  })

  it('interleaved forearms of two people keep a clear front and back (plan fixture 3)', () => {
    const front = capsuleSdf([-0.4, -0.1, 0.2], [0.4, 0.1, 0.2], 0.04)
    const back = capsuleSdf([-0.4, 0.1, 0], [0.4, -0.1, 0], 0.04)
    const { pieces } = solve([assetFrom(front, () => true), assetFrom(back, () => true)])
    expect(visible(pieces, (c) => c.owner === 0)).toBeGreaterThan(0.97 * total(pieces, (c) => c.owner === 0))
    expect(visible(pieces, (c) => c.owner === 1)).toBeLessThan(0.95 * total(pieces, (c) => c.owner === 1))
    expect(visible(pieces, (c) => c.owner === 1)).toBeGreaterThan(0.6 * total(pieces, (c) => c.owner === 1))
  })

  it('smooth contours form closed loops on a convex body', () => {
    const { pieces } = solve([assetFrom(capsuleSdf([0, -0.3, 0], [0, 0.3, 0], 0.2), () => false)])
    // Every contour key is shared by exactly two segments.
    const degree = new Map<number, number>()
    for (const { c } of pieces) for (const k of [c.k0, c.k1]) degree.set(k, (degree.get(k) ?? 0) + 1)
    expect([...degree.values()].every((d) => d === 2)).toBe(true)
  })
})
