import type { BodyRegion } from '../assets/skeleton'
import type { SegmentInput } from '../visibility/hlr'

/** Line classes, each of which must earn its place at paper scale (plan §9). */
export type LineClass = 'contour' | 'feature' | 'environment'

export interface CandidateSegment extends SegmentInput {
  owner: number
  cls: LineClass
  region: BodyRegion | 'environment'
}
