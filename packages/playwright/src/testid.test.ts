import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { Page } from '@playwright/test'
import { locateTestId, testIdSelector } from './testid.js'

/**
 * A stand-in for a Playwright scope that records what it was asked to resolve.
 * The selector strings are the contract here — driving a real browser would
 * test Playwright, not the vocabulary this module defines.
 */
interface FakeLocator {
  selector: string
  filters: unknown[]
  locator(selector: string): FakeLocator
  filter(options: unknown): FakeLocator
}

const fakeScope = (selector = ''): FakeLocator => ({
  selector,
  filters: [],
  locator(next: string) {
    return fakeScope(selector ? `${selector} >> ${next}` : next)
  },
  filter(options: unknown) {
    this.filters.push(options)
    return this
  },
})

describe('testIdSelector', () => {
  test('matches a test id exactly', () => {
    assert.equal(
      testIdSelector({ testId: 'entity-card' }),
      '[data-testid="entity-card"]'
    )
  })

  test('matches a family of test ids by prefix', () => {
    assert.equal(
      testIdSelector({ testId: 'feature-nav-', prefix: true }),
      '[data-testid^="feature-nav-"]'
    )
  })

  test('requires every data attribute the caller asked for', () => {
    assert.equal(
      testIdSelector({
        testId: 'scenario-cast-member',
        where: { 'data-persona-key': 'shopper', 'data-connected': 'false' },
      }),
      '[data-testid="scenario-cast-member"][data-persona-key="shopper"][data-connected="false"]'
    )
  })
})

describe('locateTestId', () => {
  test('resolves visible matches by default', () => {
    const scope = fakeScope()
    const target = locateTestId(
      scope as unknown as Page,
      { testId: 'entity-card' }
    ) as unknown as FakeLocator
    assert.equal(target.selector, '[data-testid="entity-card"]:visible')
  })

  test('drops the visibility filter when asked, for absence checks', () => {
    const scope = fakeScope()
    const target = locateTestId(
      scope as unknown as Page,
      { testId: 'entity-card' },
      { visible: false }
    ) as unknown as FakeLocator
    assert.equal(target.selector, '[data-testid="entity-card"]')
  })

  test('narrows to the match holding the given text', () => {
    const scope = fakeScope()
    const target = locateTestId(scope as unknown as Page, {
      testId: 'user-row',
      containing: 'shopper@actors.local',
    }) as unknown as FakeLocator
    assert.deepEqual(target.filters, [{ hasText: 'shopper@actors.local' }])
  })

  test('scopes the lookup to the element named by `within`', () => {
    const scope = fakeScope()
    const target = locateTestId(scope as unknown as Page, {
      testId: 'scenario-cast-member',
      within: { testId: 'scenario-section-orderSupportScenario' },
    }) as unknown as FakeLocator
    assert.equal(
      target.selector,
      '[data-testid="scenario-section-orderSupportScenario"] >> [data-testid="scenario-cast-member"]:visible'
    )
  })

  test('narrows the scope itself by its own text', () => {
    const scope = fakeScope()
    const scopes: FakeLocator[] = []
    const recording = {
      ...scope,
      locator(next: string) {
        const child = fakeScope(next)
        scopes.push(child)
        return child
      },
    }
    locateTestId(recording as unknown as Page, {
      testId: 'row-action',
      within: { testId: 'user-row', containing: 'shopper@actors.local' },
    })
    // The scope is filtered before the target is looked up inside it, so the
    // action resolves within the one row rather than every row.
    assert.deepEqual(scopes[0]?.filters, [
      { hasText: 'shopper@actors.local' },
    ])
  })
})
