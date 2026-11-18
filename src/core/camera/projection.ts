import { DEG } from '../math/geometry'
import { drawableRect, drawableSize, type PaperProfile, type Rect } from '../scene/paper'
import type { CameraSpec } from '../scene/types'

/**
 * Maps world metres to paper millimetres under the orthographic print camera.
 * Paper Y grows downward (SVG convention); depth grows away from the camera.
 */
export interface Projector {
  camera: CameraSpec
  paper: PaperProfile
  mmPerMetre: number
  drawRect: Rect
  /** Unit view direction (from camera into the scene). */
  viewDir: [number, number, number]
  right: [number, number, number]
  up: [number, number, number]
  project(x: number, y: number, z: number, out: Float64Array | number[], offset?: number): void
}

export function cameraBasis(elevationDeg: number) {
  const e = elevationDeg * DEG
  const viewDir: [number, number, number] = [0, -Math.sin(e), -Math.cos(e)]
  const right: [number, number, number] = [1, 0, 0]
  const up: [number, number, number] = [0, Math.cos(e), -Math.sin(e)]
  return { viewDir, right, up }
}

/** Frame a view of the given width so that it matches the paper's aspect ratio. */
export function frameCamera(paper: PaperProfile, elevationDeg: number, viewWidth: number): CameraSpec {
  const { width, height } = drawableSize(paper)
  return { elevationDeg, target: [0, 0, 0], viewWidth, viewHeight: (viewWidth * height) / width }
}

export function createProjector(camera: CameraSpec, paper: PaperProfile): Projector {
  const { viewDir, right, up } = cameraBasis(camera.elevationDeg)
  const rect = drawableRect(paper)
  const mmPerMetre = (rect.x1 - rect.x0) / camera.viewWidth
  const cx = (rect.x0 + rect.x1) / 2
  const cy = (rect.y0 + rect.y1) / 2
  const [tx, ty, tz] = camera.target
  return {
    camera,
    paper,
    mmPerMetre,
    drawRect: rect,
    viewDir,
    right,
    up,
    project(x, y, z, out, offset = 0) {
      const px = x - tx, py = y - ty, pz = z - tz
      out[offset] = cx + (right[0] * px + right[1] * py + right[2] * pz) * mmPerMetre
      out[offset + 1] = cy - (up[0] * px + up[1] * py + up[2] * pz) * mmPerMetre
      out[offset + 2] = viewDir[0] * px + viewDir[1] * py + viewDir[2] * pz
    },
  }
}
