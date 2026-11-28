import { pikkuFeature, pikkuScenario } from '#pikku/scenarios'

export const arithmeticScenario = pikkuScenario({
  title: 'Arithmetic (scenario)',
  tags: ['scenario'],
  func: async (_services, _input, { scenario, virtualUsers }) => {
    if (!virtualUsers?.ada) {
      throw new Error(
        'arithmeticScenario needs the `ada` virtual user — run via `pikku scenario run`'
      )
    }
    const added = await scenario.do(
      'ada adds two numbers',
      'addNumbers',
      { a: 2, b: 3 },
      { virtualUser: virtualUsers.ada }
    )
    if (added.sum !== 5) throw new Error(`2 + 3 was ${added.sum}`)

    // Called for its effect only: the result is never checked.
    await scenario.do(
      'ada halves a number',
      'halveNumber',
      { value: 10 },
      { virtualUser: virtualUsers.ada }
    )
  },
})

export const arithmeticFeature = pikkuFeature({
  name: 'Arithmetic',
  description: 'The two functions scenario mutate is verified against',
  tags: ['scenario'],
  scenarios: [arithmeticScenario],
})
