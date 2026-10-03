import type { Story, StoryMeta } from './csf.types'
import { Progress } from './progress'

export default {
  title: 'Progress',
  component: Progress,
  group: 'Feedback',
  description: 'How far along a task is. Pair it with a text label for the exact figure.',
  argTypes: { value: { description: 'Percent complete, 0 to 100.' } },
} satisfies StoryMeta

export const Default: Story = { args: { value: 60 } }
