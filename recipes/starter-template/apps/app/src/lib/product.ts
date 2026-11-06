import { useFeatureFlag, usePikkuAnalytics } from '@pikku/react'
import type {
  AnalyticsEvent,
  FeatureFlagName,
} from '@project/functions-sdk/types'

/** Records a declared analytics event from a screen. The name and props are checked against analytics.ts. */
export const useAnalytics = () => usePikkuAnalytics<AnalyticsEvent>()

/** Whether to show a feature. The name is checked against flags.ts; the function checks for itself. */
export const useFlag = (name: FeatureFlagName) =>
  useFeatureFlag<FeatureFlagName>(name)
