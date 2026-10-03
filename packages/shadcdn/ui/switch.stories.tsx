import type { Story, StoryMeta } from './csf.types'
import { Label } from './label'
import { Switch } from './switch'

export default {
  title: 'Switch',
  component: Switch,
  group: 'Inputs',
  description: 'An on/off setting that takes effect immediately. Always label it.',
} satisfies StoryMeta

export const Default: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Switch id="notifications" />
      <Label htmlFor="notifications">Email notifications</Label>
    </div>
  ),
}
