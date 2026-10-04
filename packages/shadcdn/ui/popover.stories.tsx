import { asI18n } from '@pikku/react'
import type { Story, StoryMeta } from './csf.types'
import { Button } from './button'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

export default {
  title: 'Popover',
  component: Popover,
  group: 'Overlays',
  description: 'Rich content anchored to a button. Use it for a small form or a picker.',
} satisfies StoryMeta

export const Default: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">{asI18n('Details')}</Button>
      </PopoverTrigger>
      <PopoverContent>Anything small and self-contained goes here.</PopoverContent>
    </Popover>
  ),
}
