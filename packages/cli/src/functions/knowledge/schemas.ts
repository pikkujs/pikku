import {
  KnowledgeIndexInput,
  KnowledgeIndexOutput,
  KnowledgeValidateInput,
  KnowledgeValidateOutput,
} from '@pikku/knowledge'

/**
 * The knowledge command schemas, re-bound to variables declared HERE rather than
 * imported straight into the command files.
 *
 * Two things about how the CLI builds itself make this the only shape that works:
 *
 * 1. The build bootstraps with the PUBLISHED CLI and inspector, so the code that
 *    reads these schemas is whatever npm has, not what is in this worktree. An
 *    identifier imported from `@pikku/knowledge` resolves to that package's
 *    `.d.ts`, and importing a declaration file yields a module with no exports at
 *    all — every one of them is a type. A binding declared in a `.ts` gives the
 *    inspector a file it can execute, and the import inside it resolves to the
 *    package's emitted JS.
 * 2. The command files import `#pikku`, which points at `dist/.pikku/` — output
 *    that does not exist yet while the bootstrap is running. A schema the
 *    inspector has to import therefore cannot live beside a wired function.
 *
 * `schemaRuntimeFile` in the inspector fixes (1) at the root, so once a release
 * carrying it is the bootstrap version, (2) is the only reason this file is here.
 */
export const KnowledgeIndexInputSchema = KnowledgeIndexInput
export const KnowledgeIndexOutputSchema = KnowledgeIndexOutput
export const KnowledgeValidateInputSchema = KnowledgeValidateInput
export const KnowledgeValidateOutputSchema = KnowledgeValidateOutput
