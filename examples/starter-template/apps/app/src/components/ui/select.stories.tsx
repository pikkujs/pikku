import { asI18n } from '@pikku/react'
import type { Story, StoryMeta } from './csf.types'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'

export default {
  title: 'Select',
  component: Select,
  group: 'Inputs',
  description: 'Pick one option from a list of five or more. Fewer than that, use radio buttons.',
} satisfies StoryMeta

export const Default: Story = {
  render: () => (
    <Select defaultValue="draft">
      <SelectTrigger aria-label={asI18n('Status')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="draft">{asI18n('Draft')}</SelectItem>
        <SelectItem value="review">{asI18n('In review')}</SelectItem>
        <SelectItem value="live">{asI18n('Live')}</SelectItem>
      </SelectContent>
    </Select>
  ),
}
