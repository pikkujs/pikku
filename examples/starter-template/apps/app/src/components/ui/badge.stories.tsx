import type { Story, StoryMeta } from './csf.types'
import { Badge } from './badge'

export default {
  title: 'Badge',
  component: Badge,
  group: 'Display',
  description: 'A short status or count. Pair a colour with text; colour alone does not carry meaning.',
  argTypes: {
    variant: { description: 'default, secondary, destructive or outline.' },
  },
} satisfies StoryMeta

export const Default: Story = { args: { children: 'Active' } }

export const Secondary: Story = { args: { children: 'Draft', variant: 'secondary' } }

export const Destructive: Story = { args: { children: 'Overdue', variant: 'destructive' } }

export const Outline: Story = { args: { children: 'Archived', variant: 'outline' } }
