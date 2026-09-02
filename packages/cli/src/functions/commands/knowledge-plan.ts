import { pikkuSessionlessFunc } from '#pikku/function'
import {
  runKnowledgePlanDefer,
  runKnowledgePlanProgress,
  runKnowledgePlanSchema,
  runKnowledgePlanSet,
  runKnowledgePlanShow,
} from '@pikku/knowledge'
import {
  renderKnowledgePlanDefer,
  renderKnowledgePlanProgress,
  renderKnowledgePlanSchema,
  renderKnowledgePlanSet,
  renderKnowledgePlanShow,
} from '../knowledge/render.js'
import {
  KnowledgePlanDeferInputSchema,
  KnowledgePlanDeferOutputSchema,
  KnowledgePlanProgressInputSchema,
  KnowledgePlanProgressOutputSchema,
  KnowledgePlanSchemaInputSchema,
  KnowledgePlanSchemaOutputSchema,
  KnowledgePlanSetInputSchema,
  KnowledgePlanSetOutputSchema,
  KnowledgePlanShowInputSchema,
  KnowledgePlanShowOutputSchema,
} from '../knowledge/schemas.js'

export const knowledgePlanSchema = pikkuSessionlessFunc({
  description:
    'Print the plan schema, so a plan is written against what is actually enforced rather than guessed at.',
  input: KnowledgePlanSchemaInputSchema,
  output: KnowledgePlanSchemaOutputSchema,
  func: async () => runKnowledgePlanSchema(),
})

export const knowledgePlanShow = pikkuSessionlessFunc({
  description:
    "Print a milestone's plan, either as it is stored or as the ordered list of work a build follows.",
  input: KnowledgePlanShowInputSchema,
  output: KnowledgePlanShowOutputSchema,
  func: async ({ config }, input) =>
    runKnowledgePlanShow(config.rootDir, input),
})

export const knowledgePlanProgress = pikkuSessionlessFunc({
  description:
    "Reconcile a milestone's plan against the generated meta and say what is still owed, so a milestone closes on what exists rather than on what was claimed.",
  input: KnowledgePlanProgressInputSchema,
  output: KnowledgePlanProgressOutputSchema,
  func: async ({ config }, input) =>
    runKnowledgePlanProgress(config.rootDir, input),
})

export const knowledgePlanSet = pikkuSessionlessFunc({
  description:
    'Validate a plan against its milestone note and write it, or write nothing and say what is wrong.',
  input: KnowledgePlanSetInputSchema,
  output: KnowledgePlanSetOutputSchema,
  func: async ({ config }, input) => runKnowledgePlanSet(config.rootDir, input),
})

export const knowledgePlanDefer = pikkuSessionlessFunc({
  description:
    'Move one first-pass item to the next pass with the reason on the record, so it stops blocking the milestone.',
  input: KnowledgePlanDeferInputSchema,
  output: KnowledgePlanDeferOutputSchema,
  func: async ({ config }, input) =>
    runKnowledgePlanDefer(config.rootDir, input),
})

export {
  renderKnowledgePlanDefer,
  renderKnowledgePlanProgress,
  renderKnowledgePlanSchema,
  renderKnowledgePlanSet,
  renderKnowledgePlanShow,
}
