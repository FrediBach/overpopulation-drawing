import { buildBodyMesh } from './bodyMesh'
import { EXPORT_RESOLUTION, getCapsuleTemplate, PREVIEW_RESOLUTION } from './capsuleTemplate'
import type { Capsule } from '../poses/fk'

const unit: Capsule = {
  bone: 'spine',
  region: 'torso',
  a: [0, 0, 0],
  b: [0, 1, 0],
  ax: [1, 0, 0],
  ay: [0, 1, 0],
  az: [0, 0, 1],
  rx: 0.3,
  rz: 0.2,
  rcap: 0.2,
  radius: 0.3,
}

describe.each([PREVIEW_RESOLUTION, EXPORT_RESOLUTION])('capsule template %o', (res) => {
  const t = getCapsuleTemplate(res)

  it('is a closed 2-manifold (every edge has two faces)', () => {
    for (let e = 0; e < t.edgeVerts.length / 2; e++) expect(t.edgeFaces[e * 2 + 1]).not.toBe(0xffffffff)
    // Euler characteristic of a sphere: V - E + F = 2
    expect(t.vertexCount - t.edgeVerts.length / 2 + t.faceCount).toBe(2)
  })

  it('winds faces outward (positive signed volume)', () => {
    const mesh = buildBodyMesh([unit], res)
    const p = mesh.positions
    let vol = 0
    for (let f = 0; f < t.faceCount; f++) {
      const [i, j, k] = [t.indices[f * 3], t.indices[f * 3 + 1], t.indices[f * 3 + 2]]
      const a = [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]]
      const b = [p[j * 3], p[j * 3 + 1], p[j * 3 + 2]]
      const c = [p[k * 3], p[k * 3 + 1], p[k * 3 + 2]]
      vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
    }
    // Elliptic cylinder + ellipsoid caps.
    const expected = Math.PI * 0.3 * 0.2 * 1 + (4 / 3) * Math.PI * 0.3 * 0.2 * 0.2
    expect(vol).toBeGreaterThan(expected * 0.8)
    expect(vol).toBeLessThan(expected * 1.01)
  })

  it('tags the authored feature rings', () => {
    expect(t.edgeRing.filter((r) => r === 'bEquator')).toHaveLength(res.radial)
    expect(t.edgeRing.filter((r) => r === 'mid')).toHaveLength(res.radial)
  })
})
