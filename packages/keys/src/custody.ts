/**
 * Where custody `file` keeps a private half. Implemented by `FileCustody` in
 * `@pikku/keys/file`; the root entry only names the shape, so it never imports
 * `node:fs`.
 */
export interface KeyFileCustody {
  /** The location for one version. Throws for a name or kid that is not a safe file name. */
  refFor(name: string, scopeKey: string, kid: string): string
  write(ref: string, privateKey: string): Promise<void>
  read(ref: string): Promise<string>
  /** True only when the half exists and only its owner can read it. */
  has(ref: string): Promise<boolean>
  remove(ref: string): Promise<void>
}
