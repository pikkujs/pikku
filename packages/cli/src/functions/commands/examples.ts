import { pikkuSessionlessFunc } from '#pikku/function'
import {
  ExamplesAddInputSchema,
  ExamplesAddOutputSchema,
  ExamplesListInputSchema,
  ExamplesListOutputSchema,
  ExamplesShowInputSchema,
  ExamplesShowOutputSchema,
} from '../examples/command-schemas.js'
import {
  runExamplesAdd,
  runExamplesList,
  runExamplesShow,
  type ExampleProject,
} from '../examples/run.js'
import {
  renderExamplesAdd,
  renderExamplesList,
  renderExamplesShow,
} from '../examples/render.js'

const projectOf = (config: {
  rootDir: string
  outDir: string
  srcDirectories: string[]
}): ExampleProject => ({
  rootDir: config.rootDir,
  outDir: config.outDir,
  srcDirectories: config.srcDirectories,
})

export const examplesList = pikkuSessionlessFunc({
  description:
    'List the worked examples this CLI ships — one per thing that is easy to get wrong and hard to discover',
  input: ExamplesListInputSchema,
  output: ExamplesListOutputSchema,
  func: async (_services, input) => runExamplesList(input?.group),
})

export const examplesShow = pikkuSessionlessFunc({
  description:
    'Print one example, renamed onto your own entity, with everything the recipe says about itself',
  input: ExamplesShowInputSchema,
  output: ExamplesShowOutputSchema,
  func: async ({ config }, input) =>
    runExamplesShow(projectOf(config), input.name, input.entity),
})

export const examplesAdd = pikkuSessionlessFunc({
  description:
    'Write one example into this project, already named for your entity, or say what is in the way and write nothing',
  input: ExamplesAddInputSchema,
  output: ExamplesAddOutputSchema,
  func: async ({ config }, input) =>
    runExamplesAdd(projectOf(config), input.name, input.entity, input.app),
})

export { renderExamplesAdd, renderExamplesList, renderExamplesShow }
