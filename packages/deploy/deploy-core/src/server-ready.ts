/**
 * Printed once the server is listening AND the project's `afterStart`
 * lifecycle has resolved.
 *
 * The runtime's own `listening on …` line is emitted inside `server.start()`,
 * which runs *before* `afterStart` — so anything a project seeds there (users,
 * scopes, fixtures) is still pending when it appears, and a parent process
 * that treats it as readiness races the seed. This marker is the point at
 * which the server is actually usable, and it is what `--spawn` waits for.
 *
 * It lives here rather than in the CLI because it is a contract between a
 * pikku server and whatever spawned it, and the two ends are built by
 * different packages: `pikku dev --spawn` waits on it from the CLI, while a
 * deployed standalone binary — the desktop shell's sidecar — prints it from an
 * entry the standalone provider generates. A second copy of the string would
 * drift the moment either side changed it.
 */
export const SERVER_READY_MARKER = 'pikku: ready'

export const serverReadyLine = (hostname: string, port: number): string =>
  `${SERVER_READY_MARKER} on http://${hostname}:${port}`
