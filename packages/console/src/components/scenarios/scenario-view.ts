import { m } from '@/i18n/messages'
import type { ShellHeaderSelection } from '../ui/shellHeaderShared'

/**
 * The two ways of looking at a suite: the specification as written, and the
 * history of running it. They share a header because they are the same subject
 * read two ways, not two features.
 */
export type ScenarioView = 'features' | 'runs'

export const scenarioViewSelection = (
  value: ScenarioView,
  onChange: (view: ScenarioView) => void
): ShellHeaderSelection<ScenarioView> => ({
  ariaLabel: m.scenarios_view_aria(),
  value,
  onChange,
  options: [
    { value: 'features', label: m.scenarios_view_features() },
    { value: 'runs', label: m.scenarios_view_runs() },
  ],
})
