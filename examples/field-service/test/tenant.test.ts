import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { assertSameCompany } from '../src/lib/tenant.js'
import { WrongCompanyError } from '../src/errors.js'

/**
 * The tenant boundary is one comparison, so it gets one test — but it is the
 * comparison every read and write in this example depends on, and the shape of
 * the refusal matters as much as the refusal itself.
 */
describe('assertSameCompany', () => {
  test('a row from your own company passes through', () => {
    assert.doesNotThrow(() => assertSameCompany('co_northwind', 'co_northwind'))
  })

  test("another company's row is refused", () => {
    assert.throws(
      () => assertSameCompany('co_southgate', 'co_northwind'),
      WrongCompanyError
    )
  })

  /**
   * A left join that found nothing hands you `null`, and `null !== companyId`
   * has to refuse rather than read as "no company, so no restriction".
   */
  test('a missing company is refused, not waved through', () => {
    assert.throws(
      () => assertSameCompany(null, 'co_northwind'),
      WrongCompanyError
    )
    assert.throws(
      () => assertSameCompany(undefined, 'co_northwind'),
      WrongCompanyError
    )
  })
})
