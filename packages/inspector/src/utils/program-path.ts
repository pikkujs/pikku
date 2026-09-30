import { sep } from 'path'

/**
 * A native path in the form a TypeScript program names its files: forward
 * slashes on every platform. `sourceFile.fileName` is `D:/a/app/src/x.ts` on
 * Windows while `path.resolve` gives `D:\a\app`, so comparing the two by
 * prefix rejects every file unless one side is converted.
 */
export const toProgramPath = (nativePath: string, separator = sep): string =>
  nativePath.split(separator).join('/')
