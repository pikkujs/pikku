import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  componentMeta,
  mantineComponentNames,
  mantineManifest,
} from './index.js'

const v9 = () => {
  const found = mantineManifest('9.0.0')
  assert.ok(found, 'expected a bundled manifest for @mantine/core v9')
  return found
}

test('manifest: Button variants, sizes, styles names and css variables', () => {
  const button = v9().components.Button
  assert.ok(button)
  for (const variant of ['filled', 'light', 'outline', 'gradient']) {
    assert.ok(button.variants.includes(variant), `variant ${variant}`)
  }
  assert.ok(button.sizes.includes('compact-md'))
  assert.ok(button.stylesNames.includes('label'))
  assert.ok(button.cssVariables.root?.includes('--button-hover'))
  assert.equal(button.props.find((p) => p.name === 'size')?.default, 'sm')
  assert.equal(
    button.props.find((p) => p.name === 'fullWidth')?.kind,
    'boolean'
  )
  assert.equal(button.props.find((p) => p.name === 'color')?.kind, 'color')
})

test('manifest: Stack gap is a spacing token with default and description', () => {
  const gap = v9().components.Stack?.props.find((p) => p.name === 'gap')
  assert.equal(gap?.tokenScale, 'spacing')
  assert.equal(gap?.default, 'md')
  assert.ok(gap?.description)
})

test('manifest: shared style-system props are extracted once', () => {
  for (const name of ['m', 'p', 'fz', 'w']) {
    assert.ok(
      v9().styleProps.some((p) => p.name === name),
      name
    )
  }
})

test('componentMeta serves manifest data and merges custom variants', () => {
  const result = componentMeta('Button', '9.4.1', ['brand', 'filled'])
  assert.equal(result.source, 'manifest')
  assert.ok(result.variantOptions.includes('brand'))
  assert.equal(result.variantOptions.filter((v) => v === 'filled').length, 1)
  assert.ok(result.props.includes('fullWidth'))
  assert.ok(result.props.includes('m'))
  assert.ok(result.stylesNames?.includes('root'))
})

test('unknown component or unbundled major reports source "none"', () => {
  assert.equal(componentMeta('NotARealComponent', '9.4.1').source, 'none')
  assert.equal(componentMeta('Button', '7.0.0').source, 'none')
  assert.equal(componentMeta('Button', 'garbage').source, 'none')
})

test('no version means the newest manifest', () => {
  assert.equal(mantineManifest()?.mantineVersion, '9.4.1')
  assert.ok(mantineComponentNames().includes('Button'))
})
