import type { Story, StoryMeta } from './csf.types'
import { Button } from './button'

export default {
  title: 'Button',
  component: Button,
  group: 'Actions',
  description: 'The one control for actions. Navigation is a link; use asChild to render a Link as a Button.',
  argTypes: {
    variant: { description: 'default, destructive, outline, secondary, ghost or link.' },
    size: { description: 'default, sm, lg or icon.' },
    asChild: { description: 'Render the child element with the button styles.' },
  },
} satisfies StoryMeta

export const Default: Story = { args: { children: 'Save changes' } }

export const Secondary: Story = { args: { children: 'Cancel', variant: 'secondary' } }

export const Outline: Story = { args: { children: 'Export', variant: 'outline' } }

export const Destructive: Story = { args: { children: 'Delete', variant: 'destructive' } }

export const Ghost: Story = { args: { children: 'More', variant: 'ghost' } }

export const Small: Story = { args: { children: 'Small', size: 'sm' } }

export const Large: Story = { args: { children: 'Get started', size: 'lg' } }

export const Disabled: Story = { args: { children: 'Unavailable', disabled: true } }
