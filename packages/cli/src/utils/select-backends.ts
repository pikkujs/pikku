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

/**
 * `pikku serve` runs a server, so a project with no backend has nothing to
 * serve. An addon declares none by design and is left to its own handling.
 */
export const assertBackendToServe = (config: {
  backends?: Record<string, unknown>
  addon?: unknown
}): void => {
  if (config.addon) return
  if (Object.keys(config.backends ?? {}).length === 0) {
    throw new Error(
      'pikku serve: no backend to serve. This project declares no backends; declare one under "backends" in pikku.config.json.'
    )
  }
}
