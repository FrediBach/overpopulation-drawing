/**
 * Headless render: settings → scene snapshot → SVG + report, without the UI.
 *
 *   npm run render -- --population 1000 --seed 3 --paper A2 --out out/beach
 *   npm run render -- --lab all --count 21 --out out/lab          # pose gallery
 *   npm run render -- --lab sitting --blend standing --count 8    # in-between strip
 *
 * Writes <out>.scene.json, <out>.svg and <out>.report.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { parseArgs } from 'node:util'
import {
  compileDrawing,
  composeLab,
  DEFAULT_LAB,
  DEFAULT_SETTINGS,
  POSTURES,
  serializeScene,
  snapshotHash,
  strokesToSvg,
  synthesizeScene,
  type Posture,
} from '../src/core'

const { values } = parseArgs({
  options: {
    population: { type: 'string', default: String(DEFAULT_SETTINGS.population) },
    seed: { type: 'string', default: String(DEFAULT_SETTINGS.seed) },
    crowding: { type: 'string', default: String(DEFAULT_SETTINGS.crowding) },
    paper: { type: 'string' },
    elevation: { type: 'string' },
    'no-details': { type: 'boolean', default: false },
    lab: { type: 'string' },
    blend: { type: 'string' },
    count: { type: 'string', default: '15' },
    out: { type: 'string', default: 'out/beach' },
  },
})

const progress = (stage: string) => (f: number, label: string) =>
  process.stdout.write(`\r${stage} ${(f * 100).toFixed(0).padStart(3)}% ${label.padEnd(40)}`)

const asPosture = (v: string | undefined): Posture | 'all' => {
  if (!v || v === 'all') return 'all'
  if (!(POSTURES as readonly string[]).includes(v)) throw new Error(`Unknown posture ${v}; use one of ${POSTURES.join(', ')}`)
  return v as Posture
}

const scene = values.lab
  ? composeLab(
      {
        ...DEFAULT_LAB,
        mode: values.blend ? 'blend' : 'gallery',
        posture: asPosture(values.lab),
        postureB: (asPosture(values.blend) === 'all' ? 'standing' : values.blend) as Posture,
        count: Number(values.count),
        seed: Number(values.seed),
        paperId: values.paper ?? DEFAULT_LAB.paperId,
        elevationDeg: Number(values.elevation ?? DEFAULT_LAB.elevationDeg),
      },
      progress('lab   '),
    )
  : synthesizeScene(
      {
        ...DEFAULT_SETTINGS,
        population: Number(values.population),
        seed: Number(values.seed),
        crowding: Number(values.crowding),
        paperId: values.paper ?? DEFAULT_SETTINGS.paperId,
        elevationDeg: Number(values.elevation ?? DEFAULT_SETTINGS.elevationDeg),
      },
      progress('scene '),
    )
process.stdout.write('\n')
const json = serializeScene(scene)
const drawing = compileDrawing(scene, { details: !values['no-details'] }, progress('lines '))
process.stdout.write('\n')

const out = values.out!
mkdirSync(dirname(out), { recursive: true })
writeFileSync(`${out}.scene.json`, json)
writeFileSync(`${out}.svg`, strokesToSvg(drawing.strokes, drawing.report.paper, { title: `Overpopulation beach ${snapshotHash(json)}` }))
writeFileSync(
  `${out}.report.json`,
  JSON.stringify({ snapshot: snapshotHash(json), scene: scene.stats, validation: { failures: scene.validation.failures }, ...drawing.report }, null, 2),
)

const p = drawing.report.population
console.log(`requested ${p.requested} · placed ${p.placed} · valid ${p.valid} · in frame ${p.inFrame} · contributing ${p.contributing} · recognisable ${p.recognisable}`)
console.log(`${drawing.report.lines.strokeCount} strokes · ${(drawing.report.lines.drawLengthMm / 1000).toFixed(1)} m ink · ~${(drawing.report.lines.estimatedDurationS / 3600).toFixed(1)} h plot · scene ${(scene.stats.timingMs / 1000).toFixed(1)} s · lines ${(drawing.report.timingMs.total / 1000).toFixed(1)} s`)
console.log(`wrote ${out}.svg`)
