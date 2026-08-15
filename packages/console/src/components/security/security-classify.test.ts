import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyAdvisory } from './security-classify.js'

/**
 * Every title below is a verbatim advisory title from `bun audit` — the whole
 * point of the classifier is to survive the wording GitHub actually publishes.
 */
describe('classifyAdvisory', () => {
  const cases: Array<[string, string]> = [
    ['Command Injection in lodash', 'codeInjection'],
    [
      'lodash vulnerable to Code Injection via `_.template` imports key names',
      'codeInjection',
    ],
    [
      'Lodash has Prototype Pollution Vulnerability in `_.unset` and `_.omit` functions',
      'prototypePollution',
    ],
    [
      'Axios is Vulnerable to Denial of Service via __proto__ Key in mergeConfig',
      'prototypePollution',
    ],
    ['Axios vulnerable to Server-Side Request Forgery', 'ssrf'],
    [
      'Axios has a NO_PROXY Hostname Normalization Bypass that Leads to SSRF',
      'ssrf',
    ],
    [
      'Axios has Unrestricted Cloud Metadata Exfiltration via Header Injection Chain',
      'ssrf',
    ],
    [
      'Axios: Proxy-Authorization Credential Leak to Origin Server Across HTTP-to-HTTPS Redirect',
      'credentialLeak',
    ],
    ['Axios Cross-Site Request Forgery Vulnerability', 'csrf'],
    [
      'Axios: Regular Expression Denial of Service (ReDoS) via Cookie Name Injection',
      'redos',
    ],
    ['axios Inefficient Regular Expression Complexity vulnerability', 'redos'],
    [
      'Axios: unbounded recursion in toFormData causes DoS via deeply nested request data',
      'dos',
    ],
    [
      "Axios' HTTP adapter-streamed uploads bypass maxBodyLength when maxRedirects: 0",
      'dos',
    ],
    [
      'Axios: Null Byte Injection via Reverse-Encoding in AxiosURLSearchParams',
      'nullByte',
    ],
  ]

  for (const [title, expected] of cases) {
    test(`${expected}: ${title.slice(0, 60)}`, () => {
      assert.equal(classifyAdvisory(title), expected)
    })
  }

  test('falls back to other rather than guessing', () => {
    assert.equal(classifyAdvisory('Something entirely new'), 'other')
    assert.equal(classifyAdvisory(''), 'other')
  })

  test('is case-insensitive, as advisory titles are inconsistently cased', () => {
    assert.equal(
      classifyAdvisory('PROTOTYPE POLLUTION in minimist'),
      'prototypePollution'
    )
    assert.equal(
      classifyAdvisory('prototype pollution in minimist'),
      'prototypePollution'
    )
  })

  // Titles routinely name several weaknesses; the first rule to match wins, so
  // the ordering in RULES is load-bearing and worth pinning down.
  test('picks the more specific weakness when a title names several', () => {
    assert.equal(
      classifyAdvisory(
        'axios vulnerable to Credential Theft and Response Hijacking via Prototype Pollution Gadget in Config Merge'
      ),
      'prototypePollution'
    )
    assert.equal(
      classifyAdvisory(
        'axios has DoS & Header Injection via Prototype Pollution Read-Side Gadgets'
      ),
      'prototypePollution'
    )
  })
})
