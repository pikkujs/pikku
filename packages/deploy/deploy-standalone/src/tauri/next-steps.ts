export type TauriNextStepsOptions = {
  /** Absolute path of the generated crate. */
  shellDir: string
  /** Whether a Rust toolchain answered when the triple was resolved. */
  hasRust: boolean
}

const PREREQUISITES = 'https://tauri.app/start/prerequisites/'

/**
 * What to say once the crate and its sidecar are on disk.
 *
 * Generation is pure Node — it writes files and copies a binary — so `--desktop`
 * succeeds perfectly well on a machine that cannot build the result. Saying so
 * here is the difference between a known prerequisite and a cargo error at the
 * point someone least expects one.
 */
export const renderTauriNextSteps = ({
  shellDir,
  hasRust,
}: TauriNextStepsOptions): string[] => {
  const lines = [`  Next: cd ${shellDir} && npx tauri build`]
  if (!hasRust) {
    lines.push(
      `  That step needs a Rust toolchain, and none answered here — see ${PREREQUISITES}.`,
      '  The crate and its sidecar are complete, so another machine can build them as they are.'
    )
  }
  return lines
}
