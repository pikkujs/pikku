/**
 * A display name is the human-facing label a developer wrote, so an apostrophe
 * in it is ordinary. `JSON.stringify` emits a valid, escaped TypeScript string
 * literal; interpolating the raw text into a quoted one terminates the string
 * and the generated file stops parsing.
 */
export const tsLiteral = (value: string) => JSON.stringify(value)
