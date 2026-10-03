import type { Story, StoryMeta } from './csf.types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs'

export default {
  title: 'Tabs',
  component: Tabs,
  group: 'Navigation',
  description: 'Switch between views of the same content without leaving the page.',
} satisfies StoryMeta

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">Summary of the project.</TabsContent>
      <TabsContent value="activity">Recent changes.</TabsContent>
    </Tabs>
  ),
}
