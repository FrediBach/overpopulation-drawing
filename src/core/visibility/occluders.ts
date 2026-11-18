/**
 * Projected occluder triangles in paper space with a uniform grid index
 * (plan §9 "custom projected-triangle index").
 */
export class OccluderSet {
  /** Per triangle: u0 v0 d0 u1 v1 d1 u2 v2 d2 (paper mm, depth m). */
  tri: Float32Array
  /** Global vertex ids per triangle, for incident-face suppression. */
  verts: Int32Array
  /** Owner (person id) per triangle. */
  owner: Int32Array
  minDepth: Float32Array
  count = 0

  constructor(capacity = 1024) {
    this.tri = new Float32Array(capacity * 9)
    this.verts = new Int32Array(capacity * 3)
    this.owner = new Int32Array(capacity)
    this.minDepth = new Float32Array(capacity)
  }

  private grow(): void {
    const cap = this.owner.length * 2
    const tri = new Float32Array(cap * 9)
    tri.set(this.tri)
    const verts = new Int32Array(cap * 3)
    verts.set(this.verts)
    const owner = new Int32Array(cap)
    owner.set(this.owner)
    const minDepth = new Float32Array(cap)
    minDepth.set(this.minDepth)
    this.tri = tri
    this.verts = verts
    this.owner = owner
    this.minDepth = minDepth
  }

  add(
    u0: number, v0: number, d0: number,
    u1: number, v1: number, d1: number,
    u2: number, v2: number, d2: number,
    i0: number, i1: number, i2: number,
    owner: number,
  ): void {
    if (this.count >= this.owner.length) this.grow()
    const k = this.count++
    const o = k * 9
    const t = this.tri
    t[o] = u0; t[o + 1] = v0; t[o + 2] = d0
    t[o + 3] = u1; t[o + 4] = v1; t[o + 5] = d1
    t[o + 6] = u2; t[o + 7] = v2; t[o + 8] = d2
    this.verts[k * 3] = i0
    this.verts[k * 3 + 1] = i1
    this.verts[k * 3 + 2] = i2
    this.owner[k] = owner
    this.minDepth[k] = Math.min(d0, d1, d2)
  }
}

/** Compressed-row grid of triangle ids over paper space. */
export class TriangleGrid {
  readonly cellSize: number
  readonly x0: number
  readonly y0: number
  readonly cols: number
  readonly rows: number
  private start: Int32Array
  private items: Int32Array
  private stamp: Int32Array
  private q = 0

  constructor(occ: OccluderSet, bounds: { x0: number; y0: number; x1: number; y1: number }, cellSize: number) {
    this.cellSize = cellSize
    this.x0 = bounds.x0
    this.y0 = bounds.y0
    this.cols = Math.max(1, Math.ceil((bounds.x1 - bounds.x0) / cellSize))
    this.rows = Math.max(1, Math.ceil((bounds.y1 - bounds.y0) / cellSize))
    const cells = this.cols * this.rows
    const counts = new Int32Array(cells + 1)
    const forEachCell = (k: number, fn: (c: number) => void) => {
      const t = occ.tri
      const o = k * 9
      const minU = Math.min(t[o], t[o + 3], t[o + 6])
      const maxU = Math.max(t[o], t[o + 3], t[o + 6])
      const minV = Math.min(t[o + 1], t[o + 4], t[o + 7])
      const maxV = Math.max(t[o + 1], t[o + 4], t[o + 7])
      const c0 = Math.max(0, Math.floor((minU - this.x0) / cellSize))
      const c1 = Math.min(this.cols - 1, Math.floor((maxU - this.x0) / cellSize))
      const r0 = Math.max(0, Math.floor((minV - this.y0) / cellSize))
      const r1 = Math.min(this.rows - 1, Math.floor((maxV - this.y0) / cellSize))
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) fn(r * this.cols + c)
    }
    for (let k = 0; k < occ.count; k++) forEachCell(k, (c) => counts[c + 1]++)
    for (let i = 0; i < cells; i++) counts[i + 1] += counts[i]
    this.start = counts
    this.items = new Int32Array(counts[cells])
    const fill = counts.slice(0, cells)
    for (let k = 0; k < occ.count; k++) forEachCell(k, (c) => (this.items[fill[c]++] = k))
    this.stamp = new Int32Array(occ.count)
  }

  /** Visit each triangle whose cells overlap the box, at most once per call. */
  query(minU: number, minV: number, maxU: number, maxV: number, visit: (tri: number) => boolean | void): void {
    const q = ++this.q
    const cs = this.cellSize
    const c0 = Math.max(0, Math.floor((minU - this.x0) / cs))
    const c1 = Math.min(this.cols - 1, Math.floor((maxU - this.x0) / cs))
    const r0 = Math.max(0, Math.floor((minV - this.y0) / cs))
    const r1 = Math.min(this.rows - 1, Math.floor((maxV - this.y0) / cs))
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cell = r * this.cols + c
        for (let i = this.start[cell]; i < this.start[cell + 1]; i++) {
          const k = this.items[i]
          if (this.stamp[k] === q) continue
          this.stamp[k] = q
          if (visit(k) === false) return
        }
      }
    }
  }
}
