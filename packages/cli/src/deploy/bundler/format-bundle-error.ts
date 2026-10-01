type BundleDiagnostic = {
  message?: unknown
  text?: unknown
  location?: { file?: unknown; line?: unknown; column?: unknown } | null
}

const formatDiagnostic = (e: BundleDiagnostic): string => {
  if (e == null || typeof e !== 'object') return String(e)
  const text = e.message ?? e.text
  if (text === undefined) return JSON.stringify(e)
  const { location } = e
  return location?.file
    ? `${String(text)} (${String(location.file)}:${String(location.line)}:${String(location.column)})`
    : String(text)
}

/**
 * esbuild messages carry `text` and `location`, Bun's carry `message`; mapping
 * only `message` rendered every esbuild error as `[object Object]`.
 */
export const formatBundleError = (err: unknown): string => {
  const base = err instanceof Error ? err.message : String(err)
  const errors =
    err != null &&
    typeof err === 'object' &&
    'errors' in err &&
    Array.isArray((err as { errors: unknown }).errors)
      ? (err as { errors: BundleDiagnostic[] }).errors
          .map(formatDiagnostic)
          .join('\n  ')
      : ''
  return errors ? `${base}\n  ${errors}` : base
}
