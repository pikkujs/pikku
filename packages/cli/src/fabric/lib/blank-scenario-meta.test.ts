import { describe, test } from 'node:test'
import assert from 'node:assert'
import { blankScenarioMeta } from './blank-scenario-meta.js'

describe('blankScenarioMeta', () => {
  test("blanks a feature's own name and description", () => {
    const src = [
      'export const downloadsFeature = pikkuFeature({',
      "  name: 'Downloads',",
      "  description: 'Befunde herunterladen',",
      '})',
    ].join('\n')
    const out = blankScenarioMeta(src)
    assert.strictEqual(out.length, src.length)
    assert.ok(!out.includes('Downloads'))
    assert.ok(!out.includes('Befunde herunterladen'))
    assert.ok(out.includes('name:'))
    assert.strictEqual(out.split('\n').length, 4)
  })

  test('leaves a nested selector name visible — that one is UI copy', () => {
    const src = [
      'export const step = pikkuScenarioStep({',
      "  name: 'open the report',",
      '  run: async ({ page }) => {',
      "    await page.getByRole('button', { name: 'Speichern' }).click()",
      '  },',
      '})',
    ].join('\n')
    const out = blankScenarioMeta(src)
    assert.ok(!out.includes('open the report'), 'the step meta stayed')
    assert.ok(out.includes('Speichern'), 'a selector was blanked')
  })

  test('leaves unrelated declarations alone', () => {
    const src = "const config = { name: 'Downloads' }"
    assert.strictEqual(blankScenarioMeta(src), src)
  })

  test('leaves other fields of the same object alone', () => {
    const src = [
      'pikkuScenario({',
      "  name: 'Anmelden',",
      "  tag: 'Anmelden',",
      '})',
    ].join('\n')
    const out = blankScenarioMeta(src)
    assert.strictEqual(out.match(/Anmelden/g)?.length, 1)
    assert.ok(out.includes("tag: 'Anmelden'"))
  })

  test('handles several declarations in one file', () => {
    const src = [
      "pikkuFeature({ name: 'One' })",
      "pikkuScenario({ name: 'Two' })",
      "export const keep = 'One'",
    ].join('\n')
    const out = blankScenarioMeta(src)
    assert.ok(!out.includes("name: 'One'"))
    assert.ok(!out.includes("name: 'Two'"))
    assert.ok(out.includes("keep = 'One'"))
  })
})
