import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  personaEnvironmentErrors,
  personaEnvironmentRefusal,
  resolvePersonaEnvironments,
} from './persona-environments.js'

const ENVIRONMENTS = {
  local: {},
  staging: {},
  prod: { production: true },
  'eu-prod': { production: true },
}

describe('resolvePersonaEnvironments', () => {
  // The default that makes production opt-in: a persona nobody thought about
  // runs everywhere it is harmless and nowhere it is not.
  test('omitting environments means everywhere but production', () => {
    assert.deepEqual(resolvePersonaEnvironments({}, ENVIRONMENTS), [
      'local',
      'staging',
    ])
  })

  test('a declared list is taken verbatim, production included', () => {
    assert.deepEqual(
      resolvePersonaEnvironments(
        { disposition: 'accountable', environments: ['staging', 'prod'] },
        ENVIRONMENTS
      ),
      ['staging', 'prod']
    )
  })

  test('more than one environment can be production', () => {
    assert.deepEqual(
      resolvePersonaEnvironments({}, { a: {}, b: { production: true } }),
      ['a']
    )
  })
})

describe('personaEnvironmentErrors', () => {
  test('a persona that declares nothing cannot be wrong', () => {
    assert.deepEqual(
      personaEnvironmentErrors('shopper', { disposition: 'careless' }, ENVIRONMENTS),
      []
    )
  })

  test('an accountable persona may name production', () => {
    assert.deepEqual(
      personaEnvironmentErrors(
        'robin',
        { disposition: 'accountable', environments: ['staging', 'prod'] },
        ENVIRONMENTS
      ),
      []
    )
  })

  test('a testing disposition naming production is an error', () => {
    const [error, ...rest] = personaEnvironmentErrors(
      'shopper',
      { disposition: 'careless', environments: ['prod'] },
      ENVIRONMENTS
    )
    assert.deepEqual(rest, [])
    assert.match(error!, /names production environment 'prod'/)
    assert.match(error!, /'careless'/)
    assert.match(error!, /disposition 'accountable'/)
  })

  // The default disposition is `realistic`, which is still a testing one. A
  // persona that declares no disposition at all must not slip into production
  // on the strength of having said nothing.
  test('no disposition at all is reported as realistic, and refused', () => {
    const [error] = personaEnvironmentErrors(
      'quiet',
      { environments: ['prod'] },
      ENVIRONMENTS
    )
    assert.match(error!, /'realistic'/)
  })

  test('every offending environment is reported, not just the first', () => {
    const errors = personaEnvironmentErrors(
      'shopper',
      { disposition: 'careless', environments: ['prod', 'eu-prod'] },
      ENVIRONMENTS
    )
    assert.equal(errors.length, 2)
  })

  // A typo silently narrows the persona to nothing, which is the same class of
  // bug the rule exists to prevent — only quieter.
  test('an unknown environment names the ones that exist', () => {
    const [error] = personaEnvironmentErrors(
      'shopper',
      { environments: ['stagng'] },
      ENVIRONMENTS
    )
    assert.match(error!, /'stagng', which is not configured/)
    assert.match(error!, /local, staging, prod, eu-prod/)
  })

  test('with nothing configured it says where environments go', () => {
    const [error] = personaEnvironmentErrors('shopper', { environments: ['x'] }, {})
    assert.match(error!, /Declare it under 'environments' in pikku\.config\.json/)
  })
})

describe('personaEnvironmentRefusal', () => {
  const accountable = {
    disposition: 'accountable' as const,
    environments: ['staging', 'prod'],
  }

  test('lets a declared environment through', () => {
    assert.equal(
      personaEnvironmentRefusal('robin', accountable, 'prod', ENVIRONMENTS),
      null
    )
  })

  // Fail closed. An unresolved PIKKU_ENV is precisely the case where the build
  // check was passed by a different artifact than the one now running, so
  // "I don't know where I am" must not read as permission.
  test('an unresolved environment refuses everybody', () => {
    const refusal = personaEnvironmentRefusal(
      'robin',
      accountable,
      undefined,
      ENVIRONMENTS
    )
    assert.match(refusal!, /no environment is resolved/)
    assert.match(refusal!, /PIKKU_ENV/)
  })

  test('an unrecognised environment refuses rather than assuming staging', () => {
    const refusal = personaEnvironmentRefusal(
      'robin',
      accountable,
      'somewhere-else',
      ENVIRONMENTS
    )
    assert.match(refusal!, /is not configured/)
  })

  // The check the deployed artifact cannot have been trusted on: whatever the
  // file said, this persona is not allowed to act on real data.
  test('production refuses a testing disposition whatever it declared', () => {
    const refusal = personaEnvironmentRefusal(
      'shopper',
      { disposition: 'adversarial', environments: ['prod'] },
      'prod',
      ENVIRONMENTS
    )
    assert.match(refusal!, /only 'accountable' may act on real data/)
  })

  test('an environment outside the declared list is refused', () => {
    const refusal = personaEnvironmentRefusal(
      'robin',
      accountable,
      'local',
      ENVIRONMENTS
    )
    assert.match(refusal!, /it declares environments staging, prod/)
  })

  test('a persona declaring nothing still runs everywhere but production', () => {
    assert.equal(
      personaEnvironmentRefusal('shopper', {}, 'staging', ENVIRONMENTS),
      null
    )
    assert.match(
      personaEnvironmentRefusal('shopper', {}, 'prod', ENVIRONMENTS)!,
      /only 'accountable' may act on real data/
    )
  })
})
