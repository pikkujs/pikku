/**
 * The snippet every generated CLI entrypoint uses to decide whether it is being
 * run or merely imported. It declares `isDirectExecution`; the caller writes the
 * `if`.
 *
 * `import.meta.url === \`file://${process.argv[1]}\`` — the shape this replaces —
 * is false for any CLI invoked through a symlinked bin, because Node reports the
 * symlink in argv and the realpath in the URL, so the block never ran for an
 * installed `node_modules/.bin/<name>`. It also fails on paths the URL has to
 * percent-encode, such as one containing a space.
 */
export const DIRECT_EXECUTION_GUARD = `const isDirectExecution = await (async () => {
  if (typeof import.meta.main === 'boolean') {
    return import.meta.main
  }
  // Node exposes import.meta.main from 24.2; earlier 24.x compares realpaths,
  // which is what it is shorthand for.
  try {
    const { fileURLToPath } = await import('node:url')
    const { realpathSync } = await import('node:fs')
    return (
      process.argv[1] !== undefined &&
      realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
    )
  } catch {
    return false
  }
})()`
