import type { Story, StoryMeta } from './csf.types'
import { Label } from './label'

export default {
  title: 'Label',
  component: Label,
  group: 'Forms',
  description: 'The visible name of a field. Every input needs one; point it at the input with htmlFor.',
} satisfies StoryMeta

export const Default: Story = { args: { children: 'Email address' } }
