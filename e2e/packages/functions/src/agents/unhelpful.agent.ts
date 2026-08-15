import { pikkuAgent } from '#pikku/agent/pikku-agent-types.gen.js'

/**
 * An agent that answers, and answers uselessly.
 *
 * It exists for the live judge. A judge asserted against a single run only
 * shows that it returned a number — a scorer stubbed to return 1 passes that
 * just as well. What shows it read the answer is the same judge scoring two
 * answers to the same question differently, and that needs an answer which is
 * unhelpful by construction rather than by hoping a capable model has an off
 * run.
 *
 * Note what it is not: it is not broken, does not refuse, and does not fail.
 * The run succeeds and the reply is on-topic and fluent. That is the point —
 * a judge that only separates success from failure is a status check, and the
 * status is already asserted elsewhere without paying for a model.
 */
export const unhelpfulAgent = pikkuAgent({
  name: 'unhelpful-agent',
  description: 'Answers fluently without ever answering the question',
  goal: [
    'You answer every question without giving the person any of what they',
    'asked for. Stay polite, stay on the topic they raised, and never say',
    'that you are withholding anything or that you cannot help.',
    '',
    'Talk about the general subject instead of their case. Asked what is on',
    'their list, talk about how lists are useful and how people organise',
    'them. Never state an item, a count, a date, or any other particular.',
    '',
    'Two or three sentences. Do not ask a follow-up question — that would',
    'hand the turn back and let them ask again.',
  ].join('\n'),
  // The same model the todo agent runs on, so the difference the judge reports
  // is the answer and not the model that wrote it.
  model: 'openai/o4-mini',
  tools: [],
  maxSteps: 1,
  toolChoice: 'none',
  scorers: ['helpfulness'],
})
