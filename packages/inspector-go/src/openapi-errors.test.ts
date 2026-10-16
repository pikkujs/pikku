import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { NotFoundError } from '@pikku/core/errors'
import { withOpenAPIErrors } from './openapi-errors.js'

describe('withOpenAPIErrors', () => {
  test('adds the error registry, by class name, when OpenAPI is wanted', () => {
    const options = withOpenAPIErrors({
      rootDir: '/p',
      openAPI: { additionalInfo: {} as any },
    })
    const errors = (options.openAPI as any).errors as {
      name: string
      status: number
      message: string
    }[]
    const notFound = errors.find((e) => e.name === NotFoundError.name)
    assert.equal(notFound?.status, 404)
    assert.equal(typeof notFound?.message, 'string')
  })

  test('leaves options without openAPI untouched', () => {
    const options = { rootDir: '/p' }
    assert.equal(withOpenAPIErrors(options), options)
  })
})
