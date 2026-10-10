import type { Story, StoryMeta } from './csf.types'
import { Skeleton } from './skeleton'

export default {
  title: 'Skeleton',
  component: Skeleton,
  group: 'Feedback',
  description: 'A placeholder shaped like the content that is loading.',
} satisfies StoryMeta

export const Default: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Skeleton className="size-10 rounded-full" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
    </div>
  ),
}
