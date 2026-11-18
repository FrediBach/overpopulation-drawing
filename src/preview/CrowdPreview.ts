import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshLambertMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  Shape,
  ShapeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { cameraBasis, shorelineZ, type PreviewBatch, type SceneSnapshot } from '@/core'
import { ALERT, NEUTRAL, NOTICE, personColor, POSTURE_COLORS, SELECTED, type ColorMode } from './colors'

export interface PreviewOverlay {
  colorMode: ColorMode
  selectedId: number | null
  /** Visible ink per person (from the drawing compiler), for the visibility mode. */
  visibleMm?: number[] | null
  contributingMm?: number
}

/** Binary search the person whose face range contains `face`. */
export function personForFace(starts: Uint32Array, face: number): number {
  let lo = 0
  let hi = starts.length - 2
  if (hi < 0 || face >= starts[starts.length - 1]) return -1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (starts[mid] <= face) lo = mid
    else hi = mid - 1
  }
  return lo
}

/**
 * Interactive shaded preview. All accepted bodies are frozen into one batched
 * geometry with a per-person face range (plan §8), which keeps 1000+ people
 * at one draw call while still supporting picking and recolouring.
 */
export class CrowdPreview {
  private renderer: WebGLRenderer
  private scene = new Scene()
  private camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 500)
  private controls: OrbitControls
  private crowd: Mesh | null = null
  private environment = new Group()
  private frame: LineLoop | null = null
  private snapshot: SceneSnapshot | null = null
  private batch: PreviewBatch | null = null
  private overlay: PreviewOverlay = { colorMode: 'person', selectedId: null }
  private resizeObserver: ResizeObserver
  private raf = 0
  private needsRender = true
  private pointerDown = new Vector2()

  onPick: ((personId: number | null) => void) | null = null

  constructor(private container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(new Color('#f3efe6'))
    container.appendChild(this.renderer.domElement)
    this.renderer.domElement.style.display = 'block'

    this.scene.add(new AmbientLight(0xffffff, 1.4))
    const sun = new DirectionalLight(0xffffff, 1.8)
    sun.position.set(-20, 40, 25)
    this.scene.add(sun)
    this.scene.add(this.environment)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = false
    this.controls.screenSpacePanning = true
    this.controls.addEventListener('change', () => this.invalidate())

    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown)
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()
    const loop = () => {
      this.raf = requestAnimationFrame(loop)
      if (this.needsRender) {
        this.needsRender = false
        this.renderer.render(this.scene, this.camera)
      }
    }
    loop()
  }

  private invalidate() {
    this.needsRender = true
  }

  private resize() {
    const w = Math.max(1, this.container.clientWidth)
    const h = Math.max(1, this.container.clientHeight)
    this.renderer.setSize(w, h)
    this.fitFrustum()
    this.invalidate()
  }

  private fitFrustum() {
    const w = Math.max(1, this.container.clientWidth)
    const h = Math.max(1, this.container.clientHeight)
    const spec = this.snapshot?.camera ?? { viewWidth: 10, viewHeight: 7 }
    const aspect = w / h
    let halfW = (spec.viewWidth / 2) * 1.04
    let halfH = (spec.viewHeight / 2) * 1.04
    if (halfW / halfH > aspect) halfH = halfW / aspect
    else halfW = halfH * aspect
    this.camera.left = -halfW
    this.camera.right = halfW
    this.camera.top = halfH
    this.camera.bottom = -halfH
    this.camera.updateProjectionMatrix()
  }

  /** Align the view with the orthographic print camera. */
  resetToPrintCamera() {
    if (!this.snapshot) return
    const { viewDir, up } = cameraBasis(this.snapshot.camera.elevationDeg)
    const target = new Vector3(...this.snapshot.camera.target)
    this.camera.position.copy(target).addScaledVector(new Vector3(...viewDir), -150)
    this.camera.up.set(...up)
    this.camera.zoom = 1
    this.controls.target.copy(target)
    this.fitFrustum()
    this.controls.update()
    this.invalidate()
  }

  /** Show a scene using geometry batched by the worker (positions, normals, per-person ranges). */
  setScene(snapshot: SceneSnapshot | null, batch: PreviewBatch | null) {
    this.snapshot = snapshot
    this.batch = batch
    this.disposeCrowd()
    if (!snapshot || !batch) {
      this.invalidate()
      return
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(batch.positions, 3))
    geometry.setAttribute('normal', new BufferAttribute(batch.normals, 3))
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(batch.positions.length), 3))
    geometry.setIndex(new BufferAttribute(batch.indices, 1))
    geometry.computeBoundingSphere()
    this.crowd = new Mesh(geometry, new MeshLambertMaterial({ vertexColors: true }))
    this.scene.add(this.crowd)
    this.buildEnvironment(snapshot)
    this.applyColors()
    this.resetToPrintCamera()
  }

  setOverlay(overlay: PreviewOverlay) {
    this.overlay = overlay
    this.applyColors()
  }

  private applyColors() {
    if (!this.crowd || !this.snapshot || !this.batch) return
    const starts = this.batch.personVertexStart
    const attr = this.crowd.geometry.getAttribute('color') as BufferAttribute
    const colors = attr.array as Float32Array
    const invalid = new Set(this.snapshot.validation.invalidPeople)
    const { colorMode, selectedId, visibleMm, contributingMm = 2 } = this.overlay
    this.snapshot.people.forEach((p, i) => {
      let c: [number, number, number]
      if (p.id === selectedId) c = SELECTED
      else if (colorMode === 'posture') c = POSTURE_COLORS[p.posture]
      else if (colorMode === 'validity') c = invalid.has(p.id) ? ALERT : p.accommodated ? NOTICE : NEUTRAL
      else if (colorMode === 'visibility') c = !visibleMm ? NEUTRAL : visibleMm[i] < contributingMm ? ALERT : NEUTRAL
      else c = personColor(p.id)
      for (let v = starts[i]; v < starts[i + 1]; v++) {
        colors[v * 3] = c[0]
        colors[v * 3 + 1] = c[1]
        colors[v * 3 + 2] = c[2]
      }
    })
    attr.needsUpdate = true
    this.invalidate()
  }

  private buildEnvironment(s: SceneSnapshot) {
    const { beach } = s
    const sand = new Mesh(
      new PlaneGeometry(beach.halfWidth * 2 + 20, beach.halfDepth * 2 + 20),
      new MeshLambertMaterial({ color: '#e9dcc0' }),
    )
    sand.rotation.x = -Math.PI / 2
    sand.position.y = -0.01
    this.environment.add(sand)

    // Water: a shape bounded by the shoreline on the sand side.
    const shape = new Shape()
    const x0 = -beach.halfWidth - 10
    const x1 = beach.halfWidth + 10
    shape.moveTo(x0, beach.halfDepth + 10)
    for (let x = x0; x <= x1; x += 0.5) shape.lineTo(x, -shorelineZ(beach, x))
    shape.lineTo(x1, beach.halfDepth + 10)
    const water = new Mesh(new ShapeGeometry(shape), new MeshLambertMaterial({ color: '#9fc3cf', side: DoubleSide }))
    water.rotation.x = -Math.PI / 2
    water.position.y = -0.005
    this.environment.add(water)

    const towelMat = new MeshLambertMaterial({ color: '#f7f4ee', side: DoubleSide })
    for (const t of s.towels) {
      const towel = new Mesh(new PlaneGeometry(t.width, t.length), towelMat)
      towel.rotation.order = 'YXZ'
      towel.rotation.set(-Math.PI / 2, t.yaw, 0)
      towel.position.set(t.x, 0.002 + (t.id % 7) * 0.0004, t.z)
      this.environment.add(towel)
    }

    // Print frame, drawn in the camera plane.
    const { right, up, viewDir } = cameraBasis(s.camera.elevationDeg)
    const R = new Vector3(...right).multiplyScalar(s.camera.viewWidth / 2)
    const U = new Vector3(...up).multiplyScalar(s.camera.viewHeight / 2)
    const C = new Vector3(...s.camera.target).addScaledVector(new Vector3(...viewDir), -40)
    const pts = [C.clone().sub(R).sub(U), C.clone().add(R).sub(U), C.clone().add(R).add(U), C.clone().sub(R).add(U)]
    this.frame = new LineLoop(new BufferGeometry().setFromPoints(pts), new LineBasicMaterial({ color: '#c2410c' }))
    this.environment.add(this.frame)
  }

  private handlePointerDown = (e: PointerEvent) => {
    this.pointerDown.set(e.clientX, e.clientY)
  }

  private handlePointerUp = (e: PointerEvent) => {
    if (this.pointerDown.distanceTo(new Vector2(e.clientX, e.clientY)) > 4) return
    if (!this.crowd || !this.snapshot || !this.batch) return
    const rect = this.renderer.domElement.getBoundingClientRect()
    const ndc = new Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    const ray = new Raycaster()
    ray.setFromCamera(ndc, this.camera)
    const hit = ray.intersectObject(this.crowd, false)[0]
    const index = hit?.faceIndex != null ? personForFace(this.batch.personFaceStart, hit.faceIndex) : -1
    this.onPick?.(index >= 0 ? this.snapshot.people[index].id : null)
  }

  private disposeCrowd() {
    if (this.crowd) {
      this.scene.remove(this.crowd)
      this.crowd.geometry.dispose()
      ;(this.crowd.material as MeshLambertMaterial).dispose()
      this.crowd = null
    }
    this.environment.traverse((o) => {
      if (o instanceof Mesh || o instanceof LineLoop) {
        o.geometry.dispose()
        ;(o.material as { dispose(): void }).dispose()
      }
    })
    this.environment.clear()
    this.frame = null
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.resizeObserver.disconnect()
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown)
    this.renderer.domElement.removeEventListener('pointerup', this.handlePointerUp)
    this.controls.dispose()
    this.disposeCrowd()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
