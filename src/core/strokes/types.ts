import type { BodyRegion } from '../assets/skeleton'
import type { LineClass } from '../contours/types'

/** A visible, attributed pen path in paper millimetres. */
export interface Stroke {
  /** Person id, or -1 for environment marks. */
  owner: number
  cls: LineClass
  region: BodyRegion | 'environment'
  /** Flat [x0, y0, x1, y1, ...] in mm. */
  points: number[]
  closed: boolean
}

export interface VisiblePiece {
  owner: number
  cls: LineClass
  region: BodyRegion | 'environment'
  /** Endpoint keys: a mesh vertex id when the piece reaches an original vertex, else a unique negative id. */
  k0: number
  k1: number
  x0: number
  y0: number
  x1: number
  y1: number
}
