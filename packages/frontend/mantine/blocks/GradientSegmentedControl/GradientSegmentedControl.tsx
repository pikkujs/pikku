import { SegmentedControl } from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'
import classes from './GradientSegmentedControl.module.css'

export function GradientSegmentedControl() {
  return (
    <SegmentedControl
      radius="xl"
      size="md"
      data={[
        { value: 'all', label: m.gradientsegmentedcontrol__all() },
        { value: 'ai-ml', label: asI18n('AI/ML') },
        { value: 'cpp', label: asI18n('C++') },
        { value: 'rust', label: asI18n('Rust') },
        { value: 'typescript', label: asI18n('TypeScript') },
      ]}
      classNames={classes}
    />
  )
}
