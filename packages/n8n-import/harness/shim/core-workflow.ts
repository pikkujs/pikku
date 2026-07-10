/** Harness shim — stands in for `@pikku/core/workflow`'s `template` helper. */

export type TemplateString = { $template: { parts: string[]; refs: unknown[] } }

export const template = (parts: string, refs: unknown[]): TemplateString => ({
  $template: { parts: [parts], refs },
})
