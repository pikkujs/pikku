export interface ProductHooksOptions {
  /** Import path to the file exporting `AnalyticsEvent`; set only when the app declares events. */
  analyticsPath?: string
  /** Import path to the file exporting `FeatureFlagName`; set only when the app declares flags. */
  flagsPath?: string
}

/**
 * The app's analytics and feature-flag hooks, bound to its own declared types.
 *
 * `@pikku/react` ships `usePikkuAnalytics` and `useFeatureFlag` generic over the
 * event and flag vocabulary, so each call site would have to name the type to
 * get a misspelt event or flag rejected. These close over it once. Each hook is
 * emitted only when its declaration exists, so an app with neither gets no
 * file at all.
 */
export const serializeProductHooks = ({
  analyticsPath,
  flagsPath,
}: ProductHooksOptions): string => {
  const reactImports = [
    ...(flagsPath ? ['useFeatureFlag'] : []),
    ...(analyticsPath ? ['usePikkuAnalytics'] : []),
  ]
  const typeImports = [
    ...(analyticsPath
      ? [`import type { AnalyticsEvent } from '${analyticsPath}'`]
      : []),
    ...(flagsPath
      ? [`import type { FeatureFlagName } from '${flagsPath}'`]
      : []),
  ]
  const analyticsHook = analyticsPath
    ? `
/** Typed to the app's \`defineAnalyticsEvents\`: an undeclared event name, or a payload that does not match it, is a build error. */
export const useAnalytics = () => usePikkuAnalytics<AnalyticsEvent>()
`
    : ''
  const flagHook = flagsPath
    ? `
/** Typed to the app's \`defineFeatureFlags\`: an undeclared flag name is a build error. */
export const useFlag = (name: FeatureFlagName) =>
  useFeatureFlag<FeatureFlagName>(name)
`
    : ''

  return `import { ${reactImports.join(', ')} } from '@pikku/react'
${typeImports.join('\n')}
${analyticsHook}${flagHook}`
}
