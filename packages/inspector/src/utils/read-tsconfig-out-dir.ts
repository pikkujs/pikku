import ts from 'typescript'

/**
 * A tsconfig's resolved `compilerOptions.outDir`, or undefined when it sets
 * none. Resolved through the compiler so `extends` chains are followed.
 */
export const readTsconfigOutDir = (tsconfig: string): string | undefined => {
  const parsed = ts.getParsedCommandLineOfConfigFile(tsconfig, {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: () => {},
  } as ts.ParseConfigFileHost)
  return parsed?.options.outDir
}
