import type { Story, StoryMeta } from './csf.types'
import { Textarea } from './textarea'

export default {
  title: 'Textarea',
  component: Textarea,
  group: 'Forms',
  description: 'A multi-line text field for longer answers. Pair it with a visible Label.',
} satisfies StoryMeta

export const Default: Story = { args: { placeholder: 'Tell us more' } }

export const Disabled: Story = { args: { disabled: true, placeholder: 'Read only' } }
