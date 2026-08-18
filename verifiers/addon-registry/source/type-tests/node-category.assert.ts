/**
 * An addon declares its categories in `pikku.config.json` under `addon`, and
 * the generated `NodeConfig` narrows `category` to that union. Core types the
 * field as `CoreNodeConfig`, whose `category` is `string`, so every config type
 * a user reaches has to override it — otherwise the narrowing is generated for
 * the sibling barrels and never checks the one place people write `node:`.
 *
 * This addon declares `["Utility"]`, and `src/functions/hello.functions.ts`
 * covers the accepted case on a real registered node. The rejected case lives
 * here rather than under `srcDirectories`, because `pikkuNodesMeta` also fails
 * codegen on an undeclared category — the inspector would kill `pikku all`
 * before tsc ever ran.
 */
import { pikkuSessionlessFunc } from '../.pikku/addon/function/index.js'

export const undeclaredCategory = pikkuSessionlessFunc<void, void>({
  func: async () => {},
  node: {
    displayName: 'Undeclared',
    // @ts-expect-error - 'Reporting' is not in the addon's declared categories
    category: 'Reporting',
    type: 'action',
  },
})

export const undeclaredCategoryWithSchema = pikkuSessionlessFunc({
  func: async () => {},
  node: {
    displayName: 'Undeclared',
    // @ts-expect-error - the schema overload narrows `category` too
    category: 'Reporting',
    type: 'action',
  },
})
