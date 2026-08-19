import type { VariablesService } from '@pikku/core/services'

/**
 * Is this process a per-unit deploy codegen run?
 *
 * Deploy plan runs a full `pikku all` once per unit with `--outDir` pointed at
 * that unit's `.pikku`. Scaffold files are *project source* — written once and
 * then owned by the developer — and their import paths are computed against
 * `config.outDir`, so regenerating them under a redirected outDir rewrites the
 * developer's tree to point at `.deploy/<provider>/units/<unit>/.pikku`. The
 * source then no longer typechecks until `pikku all` is run again.
 *
 * Every generator that writes into the scaffold directory has to ask this
 * before writing.
 *
 * Note the coercion. `LocalVariablesService.get` runs the raw value through
 * `JSON.parse`, so the string `'1'` arrives as the *number* `1` and a
 * `=== '1'` check silently never matches — which is exactly how this guard came
 * to exist while having no effect. Compare on the stringified value so the
 * check holds whichever way the variable is supplied.
 */
export const isDeployCodegen = async (
  variables: VariablesService
): Promise<boolean> => {
  const flag = await variables.get('PIKKU_DEPLOY_CODEGEN')
  return flag !== undefined && flag !== null && String(flag) === '1'
}
