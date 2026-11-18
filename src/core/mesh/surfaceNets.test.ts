import { surfaceNets, type GridSpec } from './surfaceNets'
import { buildTopology, signedVolume } from './topology'

function sphereGrid(r: number, cell: number) {
  const n = Math.ceil((2 * r + 4 * cell) / cell) + 1
  const origin: [number, number, number] = [-(n - 1) * cell / 2, -(n - 1) * cell / 2, -(n - 1) * cell / 2]
  const values = new Float32Array(n * n * n)
  for (let k = 0; k < n; k++)
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const x = origin[0] + i * cell, y = origin[1] + j * cell, z = origin[2] + k * cell
        values[i + n * (j + n * k)] = Math.hypot(x, y, z) - r
      }
  const grid: GridSpec = { origin, cell, dims: [n, n, n] }
  return surfaceNets(values, grid)
}

describe('surfaceNets', () => {
  const mesh = sphereGrid(1, 0.1)

  it('produces a closed manifold', () => {
    const topo = buildTopology(mesh.indices, mesh.positions.length / 3)
    expect(topo.manifold).toBe(true)
    expect(topo.vertexCount - topo.edgeVerts.length / 2 + topo.faceCount).toBe(2)
  })

  it('winds outward and approximates the volume', () => {
    const vol = signedVolume(mesh.positions, mesh.indices)
    expect(vol).toBeGreaterThan((4 / 3) * Math.PI * 0.93)
    expect(vol).toBeLessThan((4 / 3) * Math.PI * 1.03)
  })
})
