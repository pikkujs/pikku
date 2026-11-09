/**
 * The backends a `pikku all` run builds: every declared one, or the one
 * `--backend` names.
 */
export const selectBackends = (
  backends: Record<string, unknown> | undefined,
  only?: string
): string[] => {
  const declared = Object.keys(backends ?? {})
  if (!only) return declared
  if (!declared.includes(only)) {
    throw new Error(
      `Unknown --backend '${only}'. Declared backends: ${declared.join(', ') || '(none)'}`
    )
  }
  return [only]
}
