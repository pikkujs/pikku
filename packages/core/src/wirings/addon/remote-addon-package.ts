/** A `wireRemoteAddon` `package` value split into the package name and the optional semver range after it. */
export type RemoteAddonPackageSpec = {
  /** The package name, e.g. `@pikkustudio/addon-cloud-api`. */
  name: string
  /** The semver range, e.g. `^1.4.0`. Absent when the spec names only the package. */
  range?: string
}

/**
 * Splits `@scope/name@^1.4.0` into its name and range at the last `@` after
 * the first character, so a scope's leading `@` is never taken for the
 * separator. Throws when either half is empty.
 */
export const parseRemoteAddonPackage = (
  spec: string
): RemoteAddonPackageSpec => {
  const trimmed = spec.trim()
  const at = trimmed.lastIndexOf('@')
  if (at <= 0) {
    if (!trimmed || trimmed === '@') {
      throw new Error(`'${spec}' is not a package name`)
    }
    return { name: trimmed }
  }
  const name = trimmed.slice(0, at)
  const range = trimmed.slice(at + 1).trim()
  if (!range) {
    throw new Error(
      `'${spec}' ends in '@' with no version range after it. Write '${name}@^1.0.0', or drop the '@'.`
    )
  }
  return { name, range }
}
