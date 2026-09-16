import {
  ExamplesAddInput,
  ExamplesAddOutput,
  ExamplesListInput,
  ExamplesListOutput,
  ExamplesShowInput,
  ExamplesShowOutput,
} from './schemas.js'

/**
 * The schemas the wired commands bind to.
 *
 * Re-bound here for the reason the knowledge commands re-bind theirs: the inspector that
 * reads a command's schema is the PUBLISHED one during the bootstrap build, and a command
 * file imports `#pikku`, which points at output that does not exist yet at that point. A
 * schema the inspector has to import therefore cannot live beside a wired function.
 */
export const ExamplesListInputSchema = ExamplesListInput
export const ExamplesListOutputSchema = ExamplesListOutput
export const ExamplesShowInputSchema = ExamplesShowInput
export const ExamplesShowOutputSchema = ExamplesShowOutput
export const ExamplesAddInputSchema = ExamplesAddInput
export const ExamplesAddOutputSchema = ExamplesAddOutput
