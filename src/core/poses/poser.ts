import { Matrix4, Quaternion, Vector3 } from 'three'
import type { BoneName, BoneSpec } from '../assets/skeleton'
import { eulerToQuat } from './fk'
import type { EulerDeg } from './types'

/** Mutable skeleton with local quaternions and lazily updated world transforms. */
export class Poser {
  readonly index: Map<BoneName, number>
  readonly local: Quaternion[]
  readonly world: Matrix4[]
  rootQuat = new Quaternion()
  private dirty = true

  constructor(readonly skeleton: BoneSpec[]) {
    this.index = new Map(skeleton.map((b, i) => [b.name, i]))
    this.local = skeleton.map(() => new Quaternion())
    this.world = skeleton.map(() => new Matrix4())
  }

  setRoot(euler: EulerDeg): void {
    eulerToQuat(euler, this.rootQuat)
    this.dirty = true
  }

  setLocal(bone: BoneName, q: Quaternion): void {
    this.local[this.index.get(bone)!].copy(q)
    this.dirty = true
  }

  setLocalEuler(bone: BoneName, e: EulerDeg): void {
    eulerToQuat(e, this.local[this.index.get(bone)!])
    this.dirty = true
  }

  update(): void {
    if (!this.dirty) return
    const one = new Vector3(1, 1, 1)
    const root = new Matrix4().makeRotationFromQuaternion(this.rootQuat)
    const local = new Matrix4()
    this.skeleton.forEach((bone, i) => {
      const parent = bone.parent ? this.world[this.index.get(bone.parent)!] : root
      local.compose(new Vector3(...bone.offset), this.local[i], one)
      this.world[i].multiplyMatrices(parent, local)
    })
    this.dirty = false
  }

  position(bone: BoneName, out = new Vector3()): Vector3 {
    this.update()
    return out.setFromMatrixPosition(this.world[this.index.get(bone)!])
  }

  /** World rotation of a bone (parent rotation for the root's children uses rootQuat). */
  worldQuat(bone: BoneName, out = new Quaternion()): Quaternion {
    this.update()
    return out.setFromRotationMatrix(this.world[this.index.get(bone)!])
  }

  parentWorldQuat(bone: BoneName, out = new Quaternion()): Quaternion {
    const parent = this.skeleton[this.index.get(bone)!].parent
    return parent ? this.worldQuat(parent, out) : out.copy(this.rootQuat)
  }

  /** A bone-local point in pose-frame coordinates. */
  point(bone: BoneName, local: [number, number, number], out = new Vector3()): Vector3 {
    this.update()
    return out.set(...local).applyMatrix4(this.world[this.index.get(bone)!])
  }

  /** Bone-local axis in the pose frame. */
  axis(bone: BoneName, axis: 0 | 1 | 2, out = new Vector3()): Vector3 {
    this.update()
    return out.setFromMatrixColumn(this.world[this.index.get(bone)!], axis).normalize()
  }
}
