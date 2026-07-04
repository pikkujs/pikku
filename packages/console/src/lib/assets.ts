/**
 * Public assets must be referenced through BASE_URL — the console is served
 * under /console, so absolute paths like /pikku-console-logo.png would miss
 * the mount.
 */
export const consoleLogoUrl = `${import.meta.env.BASE_URL}pikku-console-logo.png`
