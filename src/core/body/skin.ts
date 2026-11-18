import { Matrix4 } from 'three'
import type { BodyAsset } from './asset'
import { matrixToDualQuat, skinDualQuat } from './dualQuat'

const tmp = new Matrix4()
const tmpInv = new Matrix4()

/** Pose an asset's rest surface with world bone matrices (16 per bone). */
export function skinBody(asset: BodyAsset, boneMatrices: Float64Array, out?: Float32Array): Float32Array {
  const boneCount = boneMatrices.length / 16
  const dq = new Float64Array(boneCount * 8)
  for (let b = 0; b < boneCount; b++) {
    tmp.fromArray(boneMatrices, b * 16)
    tmpInv.fromArray(asset.restInverse, b * 16)
    tmp.multiply(tmpInv)
    matrixToDualQuat(tmp.elements, 0, dq, b * 8)
  }
  const positions = out ?? new Float32Array(asset.restPositions.length)
  skinDualQuat(asset.restPositions, asset.joints, asset.weights, dq, positions)
  return positions
}
