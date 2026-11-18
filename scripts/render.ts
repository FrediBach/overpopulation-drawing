/**
 * Headless render: settings → scene snapshot → SVG + report, without the UI.
 *
 *   npm run render -- --population 1000 --seed 3 --paper A2 --out out/beach
 *
 * Writes <out>.scene.json, <out>.svg and <out>.report.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { parseArgs } from 'node:util'
import { compileDrawing, DEFAULT_SETTINGS, serializeScene, snapshotHash, strokesToSvg, synthesizeScene } from '../src/core'

const { values } = parseArgs({
  options: {
    population: { type: 'string', default: String(DEFAULT_SETTINGS.population) },
    seed: { type: 'string', default: String(DEFAULT_SETTINGS.seed) },
    crowding: { type: 'string', default: String(DEFAULT_SETTINGS.crowding) },
    paper: { type: 'string', default: DEFAULT_SETTINGS.paperId },
    elevation: { type: 'string', default: String(DEFAULT_SETTINGS.elevationDeg) },
    'no-details': { type: 'boolean', default: false },
    out: { type: 'string', default: 'out/beach' },
  },
})

const settings = {
  ...DEFAULT_SETTINGS,
  population: Number(values.population),
  seed: Number(values.seed),
  crowding: Number(values.crowding),
  paperId: values.paper!,
  elevationDeg: Number(values.elevation),
}

const scene = synthesizeScene(settings, (f, label) => process.stdout.write(`\rscene  ${(f * 100).toFixed(0)}% ${label}      `))
process.stdout.write('\n')
const json = serializeScene(scene)
const drawing = compileDrawing(scene, { details: !values['no-details'] }, (f, label) =>
  process.stdout.write(`\rlines  ${(f * 100).toFixed(0)}% ${label}      `),
)
process.stdout.write('\n')

const out = values.out!
mkdirSync(dirname(out), { recursive: true })
writeFileSync(`${out}.scene.json`, json)
writeFileSync(`${out}.svg`, strokesToSvg(drawing.strokes, drawing.report.paper, { title: `Overpopulation beach ${snapshotHash(json)}` }))
writeFileSync(`${out}.report.json`, JSON.stringify({ snapshot: snapshotHash(json), scene: scene.stats, validation: { failures: scene.validation.failures.length }, ...drawing.report }, null, 2))

const p = drawing.report.population
console.log(`requested ${p.requested} · placed ${p.placed} · valid ${p.valid} · in frame ${p.inFrame} · contributing ${p.contributing} · recognisable ${p.recognisable}`)
console.log(`${drawing.report.lines.strokeCount} strokes · ${(drawing.report.lines.drawLengthMm / 1000).toFixed(1)} m ink · ~${(drawing.report.lines.estimatedDurationS / 3600).toFixed(1)} h plot`)
console.log(`wrote ${out}.svg`)
