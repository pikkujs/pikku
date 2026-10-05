import type { Story, StoryMeta } from './csf.types'
import { Separator } from './separator'

export default {
  title: 'Separator',
  component: Separator,
  group: 'Display',
  description: 'A hairline between groups of content, horizontal or vertical.',
} satisfies StoryMeta

export const Horizontal: Story = { args: { orientation: 'horizontal' } }
