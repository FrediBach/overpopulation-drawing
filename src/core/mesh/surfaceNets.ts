/**
 * Surface nets polygonisation of a scalar field sampled on a regular grid
 * (negative = inside). Produces a closed, outward-wound triangle mesh with
 * one vertex per surface-crossing cell.
 */
export interface GridSpec {
  origin: [number, number, number]
  cell: number
  /** Number of sample points along each axis. */
  dims: [number, number, number]
}

export interface TriMesh {
  positions: Float32Array
  indices: Uint32Array
}

const CORNERS = [
  [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
  [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
] as const

const CUBE_EDGES: [number, number][] = [
  [0, 1], [2, 3], [4, 5], [6, 7],
  [0, 2], [1, 3], [4, 6], [5, 7],
  [0, 4], [1, 5], [2, 6], [3, 7],
]

export function surfaceNets(values: Float32Array, grid: GridSpec): TriMesh {
  const [nx, ny, nz] = grid.dims
  const [ox, oy, oz] = grid.origin
  const h = grid.cell
  const at = (i: number, j: number, k: number) => values[i + nx * (j + ny * k)]
  const cx = nx - 1
  const cy = ny - 1
  const cz = nz - 1
  const cellVertex = new Int32Array(cx * cy * cz).fill(-1)
  const pos: number[] = []
  const corner = new Float64Array(8)

  for (let k = 0; k < cz; k++) {
    for (let j = 0; j < cy; j++) {
      for (let i = 0; i < cx; i++) {
        let mask = 0
        for (let c = 0; c < 8; c++) {
          const v = at(i + CORNERS[c][0], j + CORNERS[c][1], k + CORNERS[c][2])
          corner[c] = v
          if (v < 0) mask |= 1 << c
        }
        if (mask === 0 || mask === 255) continue
        let sx = 0, sy = 0, sz = 0, n = 0
        for (const [a, b] of CUBE_EDGES) {
          const va = corner[a]
          const vb = corner[b]
          if (va < 0 === vb < 0) continue
          const t = va / (va - vb)
          sx += CORNERS[a][0] + (CORNERS[b][0] - CORNERS[a][0]) * t
          sy += CORNERS[a][1] + (CORNERS[b][1] - CORNERS[a][1]) * t
          sz += CORNERS[a][2] + (CORNERS[b][2] - CORNERS[a][2]) * t
          n++
        }
        cellVertex[i + cx * (j + cy * k)] = pos.length / 3
        pos.push(ox + (i + sx / n) * h, oy + (j + sy / n) * h, oz + (k + sz / n) * h)
      }
    }
  }

  const idx: number[] = []
  const cellAt = (i: number, j: number, k: number) => cellVertex[i + cx * (j + cy * k)]
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return
    if (flip) [b, d] = [d, b]
    // Split along the shorter diagonal.
    const d02 = (pos[a * 3] - pos[c * 3]) ** 2 + (pos[a * 3 + 1] - pos[c * 3 + 1]) ** 2 + (pos[a * 3 + 2] - pos[c * 3 + 2]) ** 2
    const d13 = (pos[b * 3] - pos[d * 3]) ** 2 + (pos[b * 3 + 1] - pos[d * 3 + 1]) ** 2 + (pos[b * 3 + 2] - pos[d * 3 + 2]) ** 2
    if (d02 <= d13) idx.push(a, b, c, a, c, d)
    else idx.push(a, b, d, b, c, d)
  }

  // Each sign-changing grid edge produces one quad from its four surrounding cells.
  for (let k = 1; k < cz; k++) {
    for (let j = 1; j < cy; j++) {
      for (let i = 0; i < cx; i++) {
        const v0 = at(i, j, k) < 0
        if (v0 === at(i + 1, j, k) < 0) continue
        quad(cellAt(i, j - 1, k - 1), cellAt(i, j, k - 1), cellAt(i, j, k), cellAt(i, j - 1, k), !v0)
      }
    }
  }
  for (let k = 1; k < cz; k++) {
    for (let j = 0; j < cy; j++) {
      for (let i = 1; i < cx; i++) {
        const v0 = at(i, j, k) < 0
        if (v0 === at(i, j + 1, k) < 0) continue
        quad(cellAt(i - 1, j, k - 1), cellAt(i - 1, j, k), cellAt(i, j, k), cellAt(i, j, k - 1), !v0)
      }
    }
  }
  for (let k = 0; k < cz; k++) {
    for (let j = 1; j < cy; j++) {
      for (let i = 1; i < cx; i++) {
        const v0 = at(i, j, k) < 0
        if (v0 === at(i, j, k + 1) < 0) continue
        quad(cellAt(i - 1, j - 1, k), cellAt(i, j - 1, k), cellAt(i, j, k), cellAt(i - 1, j, k), !v0)
      }
    }
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) }
}
