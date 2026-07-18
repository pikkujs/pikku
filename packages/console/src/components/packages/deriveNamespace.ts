// The wireAddon `name` (and the addons/<name>.addon.ts filename) for an addon.
// Defaults to a slug of the package name; the install UI lets the user override
// it so the same package can be wired more than once under different names.
export const deriveNamespace = (packageName: string): string => {
  const base = packageName
    .replace('@pikku/addon-', '')
    .replace(/^@[^/]+\//, '')
    .toLowerCase()
  const namespace = base.replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  if (!namespace) {
    throw new Error(
      `Unable to derive namespace from package name: ${packageName}`
    )
  }
  return namespace
}

// A namespace the user typed: lowercase, digits, hyphens; must be non-empty.
// Mirrors the installAddon backend guard so we can validate inline before the
// round-trip.
export const isValidNamespace = (namespace: string): boolean =>
  /^[a-z0-9-]+$/.test(namespace)
