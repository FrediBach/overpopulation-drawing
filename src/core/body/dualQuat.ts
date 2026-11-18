/**
 * Dual-quaternion linear blend skinning (Kavan et al.): avoids the volume
 * collapse of matrix blending at bent knees, elbows and hips.
 * Dual quaternions are stored as 8 numbers: real (x, y, z, w), dual (x, y, z, w).
 */
export function matrixToDualQuat(m: ArrayLike<number>, o: number, out: Float64Array, oo: number): void {
  // Rotation part (column-major 4x4) → quaternion.
  const m00 = m[o], m10 = m[o + 1], m20 = m[o + 2]
  const m01 = m[o + 4], m11 = m[o + 5], m21 = m[o + 6]
  const m02 = m[o + 8], m12 = m[o + 9], m22 = m[o + 10]
  const tx = m[o + 12], ty = m[o + 13], tz = m[o + 14]
  let qx: number, qy: number, qz: number, qw: number
  const trace = m00 + m11 + m22
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1)
    qw = 0.25 / s
    qx = (m21 - m12) * s
    qy = (m02 - m20) * s
    qz = (m10 - m01) * s
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22)
    qw = (m21 - m12) / s
    qx = 0.25 * s
    qy = (m01 + m10) / s
    qz = (m02 + m20) / s
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22)
    qw = (m02 - m20) / s
    qx = (m01 + m10) / s
    qy = 0.25 * s
    qz = (m12 + m21) / s
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11)
    qw = (m10 - m01) / s
    qx = (m02 + m20) / s
    qy = (m12 + m21) / s
    qz = 0.25 * s
  }
  out[oo] = qx
  out[oo + 1] = qy
  out[oo + 2] = qz
  out[oo + 3] = qw
  // dual = 0.5 * t * q
  out[oo + 4] = 0.5 * (tx * qw + ty * qz - tz * qy)
  out[oo + 5] = 0.5 * (-tx * qz + ty * qw + tz * qx)
  out[oo + 6] = 0.5 * (tx * qy - ty * qx + tz * qw)
  out[oo + 7] = 0.5 * (-tx * qx - ty * qy - tz * qz)
}

/**
 * Skin rest positions with up to four influences per vertex.
 * `bones` holds one dual quaternion (8 numbers) per bone.
 */
export function skinDualQuat(
  rest: Float32Array,
  joints: Uint8Array,
  weights: Float32Array,
  bones: Float64Array,
  out: Float32Array,
): void {
  const n = rest.length / 3
  for (let v = 0; v < n; v++) {
    let rx = 0, ry = 0, rz = 0, rw = 0, dx = 0, dy = 0, dz = 0, dw = 0
    const j0 = joints[v * 4] * 8
    const px0 = bones[j0], py0 = bones[j0 + 1], pz0 = bones[j0 + 2], pw0 = bones[j0 + 3]
    for (let k = 0; k < 4; k++) {
      const w0 = weights[v * 4 + k]
      if (w0 === 0) continue
      const b = joints[v * 4 + k] * 8
      // Keep all quaternions in the same hemisphere as the first influence.
      const w = bones[b] * px0 + bones[b + 1] * py0 + bones[b + 2] * pz0 + bones[b + 3] * pw0 < 0 ? -w0 : w0
      rx += bones[b] * w
      ry += bones[b + 1] * w
      rz += bones[b + 2] * w
      rw += bones[b + 3] * w
      dx += bones[b + 4] * w
      dy += bones[b + 5] * w
      dz += bones[b + 6] * w
      dw += bones[b + 7] * w
    }
    const len = Math.hypot(rx, ry, rz, rw) || 1
    rx /= len; ry /= len; rz /= len; rw /= len
    dx /= len; dy /= len; dz /= len; dw /= len
    const x = rest[v * 3], y = rest[v * 3 + 1], z = rest[v * 3 + 2]
    // Rotate: p' = p + 2 r × (r × p + w p)
    const cx = ry * z - rz * y + rw * x
    const cy = rz * x - rx * z + rw * y
    const cz = rx * y - ry * x + rw * z
    let ox = x + 2 * (ry * cz - rz * cy)
    let oy = y + 2 * (rz * cx - rx * cz)
    let oz = z + 2 * (rx * cy - ry * cx)
    // Translation: t = 2 (w_r d_v - w_d r_v + r_v × d_v)
    ox += 2 * (rw * dx - dw * rx + (ry * dz - rz * dy))
    oy += 2 * (rw * dy - dw * ry + (rz * dx - rx * dz))
    oz += 2 * (rw * dz - dw * rz + (rx * dy - ry * dx))
    out[v * 3] = ox
    out[v * 3 + 1] = oy
    out[v * 3 + 2] = oz
  }
}
