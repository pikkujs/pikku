import type { TscDiagnostic } from './tsc.js'
import type { VerifyFinding, VerifyStepId } from './types.js'

export type TscRuleScope = 'backend' | 'frontend'

export type TscRule = {
  id: string
  scope?: TscRuleScope
  codes?: number[]
  pattern: RegExp
  hint: (diagnostic: TscDiagnostic) => string
}

const didYouMean = (message: string): string | undefined =>
  /Did you mean '"([^"]+)"'\?/.exec(message)?.[1]

/** Recognisers for tsc diagnostics whose real cause the compiler's own wording hides. */
export const TSC_RULES: readonly TscRule[] = [
  {
    id: 'unknown-rpc',
    pattern:
      /is not assignable to parameter of type '(?:keyof )?(?:Flattened)?RPCMap'/,
    hint: () =>
      'This RPC name is not in the generated RPC map: either the function is not written yet (its export name is the RPC name) or codegen has not run since it was. While a name is unknown, its result widens to the union of every RPC output, so property errors on the same call are this error again.',
  },
  {
    id: 'link-built-path',
    codes: [2820],
    pattern: /Type '"\/[^"]*"' is not assignable to type '[^']*\$/,
    hint: (d) => {
      const route = didYouMean(d.message)
      return (
        '`to` holds a built path, not a declared route. Pass the route pattern with its `$param` segments as written and put the values in `params`, e.g. <Link to="/things/$thingId" params={{ thingId }}>.' +
        (route ? ` The route is \`${route}\`.` : '')
      )
    },
  },
  {
    id: 'link-params-without-route',
    codes: [2353],
    pattern: /does not exist in type 'ParamsReducerFn</,
    hint: () =>
      '`params` is set on a `to` that declares no such `$param`: either `to` is a built path that should be the route pattern, or the route takes no params and the prop should go.',
  },
  {
    id: 'i18n-node',
    scope: 'frontend',
    codes: [2322, 2747],
    pattern: /\bI18nNode\b|\bI18nString\b|TextChildren/,
    hint: () =>
      'A raw string sits where an I18nNode is required, often a literal or number next to an `m.*()` call. Put the whole sentence in one message key with the value interpolated; wrap opaque server values (a name, an id) with `asI18n(value)`.',
  },
  {
    id: 'snake-case-table-name',
    scope: 'backend',
    pattern:
      /Argument of type '"[a-z0-9]+(?:_[a-z0-9]+)+"' is not assignable to parameter of type/,
    hint: () =>
      'Kysely table and column names are camelCase in TypeScript (CamelCasePlugin maps them), so `product_size` in a migration is `productSize` here. Fix the call, not the migration; the union in the error is the table list.',
  },
  {
    id: 'scenario-step-input',
    scope: 'backend',
    pattern:
      /No overload matches this call[\s\S]{0,160}?stepName: string, rpcName:/,
    hint: () =>
      "The step's `data` does not match that RPC's `input` schema. Make it match exactly — every required field, no extra fields — rather than casting it.",
  },
  {
    id: 'function-schema-mismatch',
    scope: 'backend',
    pattern: /No overload matches this call[\s\S]{0,120}?PikkuFunctionConfig/,
    hint: () =>
      "The function's `func` and its `input`/`output` schemas disagree. Everything `func` returns must match `output`, and everything it reads must be in `input`; a type generic or return annotation competing with the schema should be removed.",
  },
  {
    id: 'date-column-is-a-date',
    scope: 'frontend',
    pattern: /Type 'string' is not assignable to type 'Date'/,
    hint: () =>
      'Date columns type as `Date` all the way to the page. Convert at the boundary: `new Date(value)` into the RPC, `value.toISOString().slice(0, 10)` back into an input; treat an empty string as null.',
  },
  {
    id: 'unknown-app-path',
    scope: 'frontend',
    pattern: /not assignable to type '(?:"\/[^']*"\s*\||[^']*\bAppPath\b)/,
    hint: () =>
      'This path is not one of the routes the router generated from `src/routes`. Create the route file for it, or link to a route that exists.',
  },
]

const matchRule = (
  diagnostic: TscDiagnostic,
  scope: TscRuleScope
): TscRule | undefined =>
  TSC_RULES.find(
    (rule) =>
      (!rule.scope || rule.scope === scope) &&
      (!rule.codes || rule.codes.includes(diagnostic.code)) &&
      rule.pattern.test(diagnostic.message)
  )

/** Maps tsc diagnostics to verify findings, naming the cause and a fix where a rule recognises it. */
export function tscFindings(
  diagnostics: readonly TscDiagnostic[],
  scope: TscRuleScope,
  step: VerifyStepId,
  locate: (file: string) => string = (file) => file
): VerifyFinding[] {
  return diagnostics
    .filter((d) => d.category === 'error' || d.category === 'warning')
    .map((d) => {
      const rule = matchRule(d, scope)
      return {
        id: rule?.id ?? 'typecheck',
        severity: d.category === 'error' ? 'error' : 'warn',
        step,
        code: `TS${d.code}`,
        message: d.message,
        ...(d.line > 0 ? { file: locate(d.file), line: d.line } : {}),
        ...(rule ? { hint: rule.hint(d) } : {}),
      }
    })
}
