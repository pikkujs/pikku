import type { Story, StoryMeta } from './csf.types'
import { Input } from './input'

export default {
  title: 'Input',
  component: Input,
  group: 'Forms',
  description: 'A single-line text field. Always pair it with a visible Label; a placeholder is only an example value.',
  argTypes: {
    type: { description: 'The input type: text, email, password, number.' },
    placeholder: { description: 'An example value, never the label.' },
  },
} satisfies StoryMeta

export const Default: Story = { args: { placeholder: 'name@example.com' } }

export const Password: Story = { args: { type: 'password', placeholder: 'Password' } }

export const Disabled: Story = { args: { disabled: true, placeholder: 'Read only' } }

export const Invalid: Story = { args: { 'aria-invalid': true, defaultValue: 'not an email' } }
