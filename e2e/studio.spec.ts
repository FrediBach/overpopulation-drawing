import { expect, test } from '@playwright/test'

test('generate a scene, compute pen lines and see the accounting', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Overpopulation Beach' })).toBeVisible()

  await page.getByRole('button', { name: 'Generate scene' }).click()
  await expect(page.getByText('All checks pass')).toBeVisible({ timeout: 60_000 })
  await page.screenshot({ path: 'test-results/shaded.png' })

  await page.getByRole('button', { name: 'Compute pen lines' }).click()
  const plot = page.getByRole('img', { name: 'Pen plot preview' })
  await expect(plot).toBeVisible({ timeout: 90_000 })
  // The SVG must actually decode (a revoked or broken URL leaves naturalWidth at 0).
  await expect.poll(() => plot.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0)
  await expect(page.getByText('Ink length')).toBeVisible()
  await page.screenshot({ path: 'test-results/lines.png' })

  expect(errors).toEqual([])
})
