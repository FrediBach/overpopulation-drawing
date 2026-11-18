import { forwardKinematics } from '../poses/fk'
import { signedVolume } from '../mesh/topology'
import { EXPORT_CELL, getBodyAsset, PREVIEW_CELL } from './asset'
import { REFERENCE_BODY } from './params'
import { REST_POSE } from './skeleton'
import { skinBody } from './skin'

describe('body asset', () => {
  const asset = getBodyAsset(REFERENCE_BODY, PREVIEW_CELL)

  it('is a closed, outward-wound surface of plausible volume', () => {
    // Surface nets may pinch where thin features nearly touch; keep that rare.
    const ef = asset.topology.edgeFaces
    let open = 0
    for (let i = 1; i < ef.length; i += 2) if (ef[i] === 0xffffffff) open++
    expect(open / (ef.length / 2)).toBeLessThan(0.005)
    // An adult body is roughly 0.06–0.09 m³.
    const vol = signedVolume(asset.restPositions, asset.indices)
    expect(vol).toBeGreaterThan(0.05)
    expect(vol).toBeLessThan(0.11)
  })

  it('has normalised skin weights', () => {
    for (let v = 0; v < asset.weights.length / 4; v++) {
      const s = asset.weights[v * 4] + asset.weights[v * 4 + 1] + asset.weights[v * 4 + 2] + asset.weights[v * 4 + 3]
      expect(s).toBeCloseTo(1, 5)
    }
  })

  it('reproduces the rest surface when skinned in the rest pose', () => {
    const mats = forwardKinematics(asset.skeleton, [0, 0, 0], REST_POSE)
    const flat = new Float64Array(mats.length * 16)
    mats.forEach((m, i) => flat.set(m.elements, i * 16))
    const posed = skinBody(asset, flat)
    let maxErr = 0
    for (let i = 0; i < posed.length; i++) maxErr = Math.max(maxErr, Math.abs(posed[i] - asset.restPositions[i]))
    expect(maxErr).toBeLessThan(1e-5)
  })

  it('reports size', () => {
    const t = performance.now()
    const fine = getBodyAsset({ ...REFERENCE_BODY, mass: 0.8 }, EXPORT_CELL)
    console.log('preview tris', asset.indices.length / 3, 'export tris', fine.indices.length / 3, 'export build ms', performance.now() - t)
  })
})
