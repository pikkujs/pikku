import { pikkuSessionlessFunc } from '#pikku/function'
import {
  AppListInput,
  AppListOutput,
  AppNativeAddInput,
  AppNativeCheckInput,
  AppNativeCheckOutput,
  AppNativeInitInput,
  AppNativeUpgradeInput,
  AppNativeWriteOutput,
} from '../app/schemas.js'
import {
  runAppList,
  runAppNativeAdd,
  runAppNativeCheck,
  runAppNativeInit,
  runAppNativeUpgrade,
} from '../app/run.js'

export const appList = pikkuSessionlessFunc({
  description: 'List the apps in `frontends`, and what each ships as.',
  input: AppListInput,
  output: AppListOutput,
  func: async ({ config }) => runAppList(config),
})

export const appNativeInit = pikkuSessionlessFunc({
  description: "Create or re-apply a frontend's native app.",
  input: AppNativeInitInput,
  output: AppNativeWriteOutput,
  func: async ({ config }, input) => runAppNativeInit(config, input),
})

export const appNativeAdd = pikkuSessionlessFunc({
  description: 'Add plugins to a native app.',
  input: AppNativeAddInput,
  output: AppNativeWriteOutput,
  func: async ({ config }, input) => runAppNativeAdd(config, input),
})

export const appNativeUpgrade = pikkuSessionlessFunc({
  description: "Rewrite pikku's files in a native app from the config.",
  input: AppNativeUpgradeInput,
  output: AppNativeWriteOutput,
  func: async ({ config }, input) => runAppNativeUpgrade(config, input),
})

export const appNativeCheck = pikkuSessionlessFunc({
  description: 'Check native apps against the config and each other.',
  input: AppNativeCheckInput,
  output: AppNativeCheckOutput,
  func: async ({ config }, input) => runAppNativeCheck(config, input),
})
