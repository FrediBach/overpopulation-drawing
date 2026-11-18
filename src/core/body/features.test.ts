import { getBodyAsset, PREVIEW_CELL } from './asset'
import { featureFields, OUTFITS } from './features'
import { REFERENCE_BODY } from './params'

describe('feature fields', () => {
  const asset = getBodyAsset(REFERENCE_BODY, PREVIEW_CELL)

  it.each([...OUTFITS])('%s defines crossing curves on masked vertices', (outfit) => {
    const fields = featureFields(asset, outfit)
    expect(fields.length).toBeGreaterThanOrEqual(2)
    for (const f of fields) {
      let neg = 0
      let pos = 0
      f.scalar.forEach((s, i) => {
        if (!f.mask[i]) return
        if (s < 0) neg++
        else pos++
      })
      // Each curve really crosses its region.
      expect(neg, f.id).toBeGreaterThan(10)
      expect(pos, f.id).toBeGreaterThan(10)
    }
  })
})
