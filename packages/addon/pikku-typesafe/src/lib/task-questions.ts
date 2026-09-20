import type { SystemOneQuestion } from '../typesafe.service.js'

export const SHAPES = {
  function: [
    'One deterministic step with a known input and a known output. No',
    'branching worth naming, nothing to decide at runtime, nothing to wait',
    'on. If it could be written as a single tested unit, it is this.',
  ].join(' '),
  workflow: [
    'Several steps whose order and branching are known in advance, or which',
    'span time, retries or external systems. The path is fixed by the author,',
    'not chosen at runtime — durability and observability are the reason to',
    'reach for it.',
  ].join(' '),
  agent: [
    'The steps cannot be enumerated ahead of time: which tool to reach for,',
    'and how many times, depends on what earlier steps turn up. Judgment at',
    'runtime is the requirement, not a convenience.',
  ].join(' '),
} satisfies Record<string, string>

/**
 * Two judgments about one task description, asked together.
 *
 * `unknown` is deliberately absent from `shape` — confidence is the channel
 * for not knowing, and a flat distribution over the three options says
 * "underspecified" far more usefully than a fourth option would.
 */
export const taskQuestions = {
  plan: {
    type: 'noul',
    instructions:
      'Should this task be planned out in writing before anyone starts building it?',
    criteria: {
      true: 'The task touches several parts of the system, has choices in it that are expensive to reverse, or is described loosely enough that two people would build different things. Writing it down first saves more than it costs.',
      false:
        'The task is small, self-contained and unambiguous. A plan would only restate it, and the time spent planning exceeds the time spent doing.',
    },
  },
  shape: {
    type: 'choice',
    instructions:
      'What should this task be built as? Judge by how much of the path is knowable before it runs, not by how hard the task is.',
    criteria: SHAPES,
  },
} satisfies Record<string, SystemOneQuestion>
