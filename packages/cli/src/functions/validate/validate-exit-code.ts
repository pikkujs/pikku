/** Errors have to fail the process, or CI passes on a report nobody reads. */
export const setValidateExitCode = ({ ok }: { ok: boolean }): void => {
  if (!ok) process.exitCode = 1
}
