import { Vector3 } from 'three'
import type { BoneName } from '../assets/skeleton'
import { lerp } from '../math/geometry'
import type { Poser } from './poser'

export interface Frame {
  o: Vector3
  left: Vector3
  up: Vector3
  front: Vector3
}

/** Everything a limb mode may refer to when choosing its goal (pose frame, before grounding). */
export interface ModeContext {
  poser: Poser
  side: 1 | -1
  sfx: 'L' | 'R'
  groundY: number
  /** Body scale. */
  H: number
  pelvis: Frame
  chest: Frame
  head: Frame
  /** Horizontal forward of the body, and horizontal left. */
  heading: Vector3
  leftH: Vector3
  shoulder: Vector3
  hip: Vector3
  armLen: number
  legLen: number
  thighLen: number
  /** Front surface offsets of abdomen and chest. */
  bellyDepth: number
  chestDepth: number
  /** Solved knee positions (available to arm modes). */
  knee?: Record<'L' | 'R', Vector3>
}

export type EndSpec = 'footFlat' | 'palmDown' | 'relaxed' | 'pointed'

export interface ModeGoal {
  target: Vector3
  pole: Vector3
  /** 'project' puts the end effector on the ground; otherwise it is only kept above it. */
  ground?: 'project'
  end: EndSpec
  /** Which bone must rest on the ground: the end effector or the lower limb segment. */
  support?: 'end' | 'lower'
}

export interface LimbMode {
  id: string
  limb: 'arm' | 'leg'
  /** Number of continuous parameters (excluding the 3 used for relaxed end orientation). */
  dims: number
  goal(ctx: ModeContext, u: number[]): ModeGoal
}

const v = () => new Vector3()
/** Point in a frame, mirrored for the right side. */
const at = (f: Frame, s: number, l: number, up: number, fr: number) =>
  v().copy(f.o).addScaledVector(f.left, l * s).addScaledVector(f.up, up).addScaledVector(f.front, fr)
const dir = (...parts: [Vector3, number][]) => parts.reduce((acc, [d, w]) => acc.addScaledVector(d, w), v()).normalize()

export const ARM_MODES: LimbMode[] = [
  {
    id: 'side', limb: 'arm', dims: 3,
    goal: (c, u) => ({
      target: at(c.pelvis, c.side, lerp(0.21, 0.32, u[0]) * c.H, lerp(-0.14, 0.06, u[1]) * c.H, lerp(-0.05, 0.1, u[2]) * c.H),
      pole: dir([c.pelvis.front, -0.8], [c.pelvis.left, 0.4 * c.side]),
      end: 'relaxed',
    }),
  },
  {
    id: 'belly', limb: 'arm', dims: 2,
    goal: (c, u) => ({
      target: at(c.pelvis, c.side, lerp(-0.02, 0.1, u[0]) * c.H, lerp(0.1, 0.28, u[1]) * c.H, c.bellyDepth + 0.03 * c.H),
      pole: dir([c.pelvis.left, c.side], [c.pelvis.up, -0.4], [c.pelvis.front, -0.3]),
      end: 'relaxed',
    }),
  },
  {
    id: 'chest', limb: 'arm', dims: 2,
    goal: (c, u) => ({
      target: at(c.chest, c.side, lerp(-0.1, 0.04, u[0]) * c.H, lerp(0.1, 0.2, u[1]) * c.H, c.chestDepth + 0.03 * c.H),
      pole: dir([c.chest.left, c.side], [c.chest.up, -0.7]),
      end: 'relaxed',
    }),
  },
  {
    id: 'behindHead', limb: 'arm', dims: 2,
    goal: (c, u) => ({
      target: at(c.head, c.side, lerp(0.02, 0.08, u[0]) * c.H, lerp(0.04, 0.1, u[1]) * c.H, -0.1 * c.H),
      pole: dir([c.chest.left, c.side], [c.chest.up, 0.5]),
      end: 'relaxed',
    }),
  },
  {
    id: 'overhead', limb: 'arm', dims: 3,
    goal: (c, u) => ({
      target: v().copy(c.shoulder)
        .addScaledVector(c.chest.up, lerp(0.38, 0.52, u[0]) * c.H)
        .addScaledVector(c.chest.left, lerp(0.02, 0.3, u[1]) * c.H * c.side)
        .addScaledVector(c.chest.front, lerp(-0.08, 0.12, u[2]) * c.H),
      pole: dir([c.chest.left, c.side], [c.chest.front, -0.3]),
      end: 'relaxed',
    }),
  },
  {
    id: 'propBehind', limb: 'arm', dims: 2,
    goal: (c, u) => ({
      target: v().copy(c.hip).addScaledVector(c.leftH, lerp(0.12, 0.24, u[0]) * c.H * c.side).addScaledVector(c.heading, -lerp(0.18, 0.36, u[1]) * c.H),
      pole: dir([c.heading, -1], [c.leftH, 0.3 * c.side]),
      ground: 'project',
      end: 'palmDown',
      support: 'end',
    }),
  },
  {
    id: 'elbowProp', limb: 'arm', dims: 2,
    goal: (c, u) => ({
      target: v().set(c.shoulder.x, 0, c.shoulder.z).addScaledVector(c.leftH, lerp(0.02, 0.12, u[0]) * c.H * c.side).addScaledVector(c.heading, lerp(0.14, 0.3, u[1]) * c.H),
      pole: dir([new Vector3(0, -1, 0), 1], [c.heading, -0.15], [c.leftH, 0.25 * c.side]),
      ground: 'project',
      end: 'palmDown',
      support: 'lower',
    }),
  },
  {
    id: 'holdFront', limb: 'arm', dims: 3,
    goal: (c, u) => ({
      target: at(c.chest, c.side, lerp(-0.02, 0.1, u[0]) * c.H, lerp(0.14, 0.32, u[1]) * c.H, lerp(0.24, 0.36, u[2]) * c.H),
      pole: dir([c.chest.up, -1], [c.chest.left, 0.6 * c.side]),
      end: 'relaxed',
    }),
  },
  {
    id: 'lap', limb: 'arm', dims: 2,
    goal: (c, u) => {
      const knee = c.knee?.[c.sfx] ?? c.hip
      return {
        target: v().lerpVectors(c.hip, knee, lerp(0.35, 0.95, u[0])).add(v().set(0, lerp(0.09, 0.14, u[1]) * c.H, 0)),
        pole: dir([c.pelvis.left, c.side], [c.heading, -0.4]),
        end: 'relaxed',
      }
    },
  },
  {
    id: 'hugKnees', limb: 'arm', dims: 2,
    goal: (c, u) => {
      const own = c.knee?.[c.sfx] ?? c.hip
      const other = c.knee?.[c.sfx === 'L' ? 'R' : 'L'] ?? c.hip
      return {
        target: v().lerpVectors(own, other, lerp(0.4, 0.8, u[0])).addScaledVector(c.heading, 0.07 * c.H).add(v().set(0, -lerp(0.04, 0.14, u[1]) * c.H, 0)),
        pole: dir([c.leftH, c.side], [new Vector3(0, -1, 0), 0.3]),
        end: 'relaxed',
      }
    },
  },
  {
    id: 'hip', limb: 'arm', dims: 2,
    goal: (c, u) => ({
      target: at(c.pelvis, c.side, lerp(0.15, 0.19, u[0]) * c.H, lerp(0.06, 0.13, u[1]) * c.H, -0.02 * c.H),
      pole: dir([c.pelvis.left, c.side], [c.pelvis.front, -0.5]),
      end: 'relaxed',
    }),
  },
  {
    id: 'behindBack', limb: 'arm', dims: 2,
    goal: (c, u) => ({
      target: at(c.pelvis, c.side, lerp(0.0, 0.08, u[0]) * c.H, lerp(0.02, 0.12, u[1]) * c.H, -0.17 * c.H),
      pole: dir([c.pelvis.left, c.side], [c.pelvis.front, -0.6]),
      end: 'relaxed',
    }),
  },
  {
    id: 'shadeEyes', limb: 'arm', dims: 2,
    goal: (c, u) => ({
      target: at(c.head, c.side, lerp(-0.02, 0.05, u[0]) * c.H, lerp(0.08, 0.11, u[1]) * c.H, 0.13 * c.H),
      pole: dir([c.chest.left, c.side], [c.chest.up, -0.3]),
      end: 'relaxed',
    }),
  },
  {
    id: 'pillow', limb: 'arm', dims: 3,
    goal: (c, u) => ({
      target: at(c.head, c.side, lerp(-0.06, 0.08, u[0]) * c.H, lerp(0.06, 0.16, u[1]) * c.H, lerp(0.06, 0.13, u[2]) * c.H),
      pole: dir([c.chest.left, c.side], [c.chest.up, 0.4]),
      ground: 'project',
      end: 'palmDown',
    }),
  },
  {
    id: 'reachOut', limb: 'arm', dims: 3,
    goal: (c, u) => {
      const d = dir([c.chest.left, lerp(0.2, 1, u[0]) * c.side], [c.chest.front, lerp(-0.2, 1, u[1])], [c.chest.up, lerp(-0.9, 0.4, u[2])])
      return {
        target: v().copy(c.shoulder).addScaledVector(d, c.armLen * lerp(0.75, 0.95, u[0])),
        pole: dir([c.chest.up, -0.6], [c.chest.front, -0.6]),
        end: 'palmDown',
      }
    },
  },
]

export const LEG_MODES: LimbMode[] = [
  {
    id: 'straight', limb: 'leg', dims: 3,
    goal: (c, u) => ({
      target: v().copy(c.hip)
        .addScaledVector(dir([c.pelvis.up, -1], [c.pelvis.left, lerp(-0.04, 0.22, u[0]) * c.side], [c.pelvis.front, lerp(-0.06, 0.06, u[1])]), c.legLen * lerp(0.94, 0.99, u[2])),
      pole: c.pelvis.front.clone(),
      end: 'relaxed',
    }),
  },
  {
    id: 'kneeUp', limb: 'leg', dims: 3,
    goal: (c, u) => ({
      target: v().copy(c.hip).addScaledVector(c.pelvis.up, -lerp(0.42, 0.72, u[0]) * c.legLen).addScaledVector(c.pelvis.left, lerp(0.02, 0.2, u[1]) * c.H * c.side),
      pole: dir([c.pelvis.front, 1], [c.pelvis.left, lerp(-0.2, 0.6, u[2]) * c.side]),
      ground: 'project',
      end: 'footFlat',
      support: 'end',
    }),
  },
  {
    id: 'kneeOut', limb: 'leg', dims: 2,
    goal: (c, u) => ({
      target: v().copy(c.hip).addScaledVector(c.pelvis.up, -lerp(0.32, 0.55, u[0]) * c.legLen).addScaledVector(c.pelvis.left, lerp(-0.08, 0.06, u[1]) * c.H * c.side),
      pole: dir([c.pelvis.left, c.side], [c.pelvis.front, 0.5]),
      end: 'relaxed',
    }),
  },
  {
    id: 'shinUp', limb: 'leg', dims: 2,
    goal: (c, u) => ({
      target: v().copy(c.hip).addScaledVector(c.pelvis.up, -lerp(0.55, 0.85, u[0]) * c.thighLen).addScaledVector(c.pelvis.front, -lerp(0.2, 0.36, u[1]) * c.H),
      pole: c.pelvis.front.clone(),
      end: 'relaxed',
    }),
  },
  {
    id: 'sideBent', limb: 'leg', dims: 3,
    goal: (c, u) => ({
      target: v().copy(c.hip).addScaledVector(c.pelvis.up, -lerp(0.35, 0.62, u[0]) * c.legLen).addScaledVector(c.pelvis.front, lerp(0.15, 0.5, u[1]) * c.legLen).addScaledVector(c.pelvis.left, lerp(-0.05, 0.12, u[2]) * c.H * c.side),
      pole: c.pelvis.front.clone(),
      end: 'relaxed',
    }),
  },
  {
    id: 'sitKneesUp', limb: 'leg', dims: 3,
    goal: (c, u) => ({
      target: v().copy(c.hip).addScaledVector(c.heading, lerp(0.32, 0.6, u[0]) * c.legLen).addScaledVector(c.leftH, lerp(0.06, 0.26, u[1]) * c.H * c.side),
      pole: dir([new Vector3(0, 1, 0), 1], [c.heading, 0.4], [c.leftH, lerp(-0.2, 0.5, u[2]) * c.side]),
      ground: 'project',
      end: 'footFlat',
      support: 'end',
    }),
  },
  {
    id: 'sitExtended', limb: 'leg', dims: 2,
    goal: (c, u) => ({
      target: v().copy(c.hip).addScaledVector(c.heading, lerp(0.8, 0.95, u[0]) * c.legLen).addScaledVector(c.leftH, lerp(0.02, 0.22, u[1]) * c.H * c.side),
      pole: new Vector3(0, 1, 0),
      ground: 'project',
      end: 'relaxed',
    }),
  },
  {
    id: 'crossLeg', limb: 'leg', dims: 2,
    goal: (c, u) => ({
      target: v().copy(c.hip).addScaledVector(c.heading, lerp(0.16, 0.3, u[0]) * c.legLen).addScaledVector(c.leftH, -lerp(0.04, 0.16, u[1]) * c.H * c.side),
      pole: dir([c.leftH, c.side], [new Vector3(0, 1, 0), 0.35]),
      ground: 'project',
      end: 'relaxed',
    }),
  },
  {
    id: 'kneel', limb: 'leg', dims: 2,
    goal: (c, u) => ({
      target: v().copy(c.hip).addScaledVector(c.leftH, lerp(0.04, 0.14, u[0]) * c.H * c.side).addScaledVector(c.heading, -lerp(0.2, 0.36, u[1]) * c.legLen),
      pole: dir([c.heading, 1], [new Vector3(0, -1, 0), 0.4]),
      ground: 'project',
      end: 'pointed',
      support: 'lower',
    }),
  },
  {
    id: 'stand', limb: 'leg', dims: 2,
    goal: (c, u) => ({
      target: v().copy(c.hip).addScaledVector(c.leftH, lerp(0.0, 0.1, u[0]) * c.H * c.side).addScaledVector(c.heading, lerp(-0.06, 0.08, u[1]) * c.H),
      pole: c.heading.clone(),
      ground: 'project',
      end: 'footFlat',
      support: 'end',
    }),
  },
  {
    id: 'standStep', limb: 'leg', dims: 2,
    goal: (c, u) => ({
      target: v().copy(c.hip).addScaledVector(c.leftH, lerp(0.02, 0.16, u[0]) * c.H * c.side).addScaledVector(c.heading, lerp(0.12, 0.3, u[1]) * c.H),
      pole: c.heading.clone(),
      ground: 'project',
      end: 'footFlat',
      support: 'end',
    }),
  },
]

export const MODE_BY_ID: Record<string, LimbMode> = Object.fromEntries([...ARM_MODES, ...LEG_MODES].map((m) => [`${m.limb}:${m.id}`, m]))

export function limbBones(limb: 'arm' | 'leg', sfx: 'L' | 'R'): [BoneName, BoneName, BoneName] {
  return limb === 'arm'
    ? [`upperArm.${sfx}`, `foreArm.${sfx}`, `hand.${sfx}`]
    : [`thigh.${sfx}`, `shin.${sfx}`, `foot.${sfx}`]
}
