import { asI18n } from '@pikku/react'
import type { Story, StoryMeta } from './csf.types'
import { Button } from './button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip'

export default {
  title: 'Tooltip',
  component: Tooltip,
  group: 'Overlays',
  description: 'A short hint on hover or focus. Never the only place a fact appears.',
} satisfies StoryMeta

export const Default: Story = {
  render: () => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline">{asI18n('Hover me')}</Button>
        </TooltipTrigger>
        <TooltipContent>{asI18n('Saved a minute ago')}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
}
