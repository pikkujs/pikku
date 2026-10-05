import { asI18n } from '@pikku/react'
import type { Story, StoryMeta } from './csf.types'
import { Checkbox } from './checkbox'
import { Label } from './label'

export default {
  title: 'Checkbox',
  component: Checkbox,
  group: 'Inputs',
  description: 'One yes/no choice inside a form. Always label it.',
} satisfies StoryMeta

export const Default: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Checkbox id="terms" />
      <Label htmlFor="terms">{asI18n('Accept the terms')}</Label>
    </div>
  ),
}
