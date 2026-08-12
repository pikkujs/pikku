import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { parseGherkin, type GherkinLine } from './gherkin.js'

const textOf = (line: GherkinLine): string =>
  line.tokens.map((token) => token.value).join('')

const personasOf = (line: GherkinLine): string[] =>
  line.tokens.filter((t) => t.type === 'persona').map((t) => t.value)

describe('parseGherkin', () => {
  test('splits the keyword off each step', () => {
    const lines = parseGherkin(
      ["Given 'owner' has no entry", 'When they write one'].join('\n')
    )

    assert.equal(lines[0]!.keyword, 'Given')
    assert.equal(lines[1]!.keyword, 'When')
    assert.equal(textOf(lines[1]!), 'they write one')
  })

  test('lifts quoted personas out, without their quotes', () => {
    const [line] = parseGherkin(`Given 'owner' shares with "guest"`)
    assert.deepEqual(personasOf(line!), ['owner', 'guest'])
    assert.equal(textOf(line!), 'owner shares with guest')
  })

  test('marks a block heading and drops its colon', () => {
    const [line] = parseGherkin('Scenario: The daily entry')
    assert.equal(line!.keyword, 'Scenario')
    assert.equal(line!.heading, true)
    assert.equal(textOf(line!), 'The daily entry')
  })

  test('reads Scenario Outline rather than stopping at Scenario', () => {
    const [line] = parseGherkin('Scenario Outline: entries per day')
    assert.equal(line!.keyword, 'Scenario Outline')
  })

  test('a keyword is a whole word', () => {
    const [line] = parseGherkin('Whenever the day rolls over')
    assert.equal(line!.keyword, null)
    assert.equal(textOf(line!), 'Whenever the day rolls over')
  })

  test('a first-person scenario has no personas to draw', () => {
    const lines = parseGherkin('Given I have no entry\nThen I see it')
    assert.deepEqual(
      lines.flatMap(personasOf),
      [],
      'nothing to chip is what makes the rejected form look wrong'
    )
  })

  test('keeps blank lines so the block keeps its shape', () => {
    const lines = parseGherkin('Given a\n\nThen b')
    assert.equal(lines.length, 3)
    assert.equal(lines[1]!.keyword, null)
    assert.equal(textOf(lines[1]!), '')
  })
})
