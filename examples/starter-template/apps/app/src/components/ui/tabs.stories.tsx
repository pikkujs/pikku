import { asI18n } from '@pikku/react'
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
        <TabsTrigger value="overview">{asI18n('Overview')}</TabsTrigger>
        <TabsTrigger value="activity">{asI18n('Activity')}</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">Summary of the project.</TabsContent>
      <TabsContent value="activity">Recent changes.</TabsContent>
    </Tabs>
  ),
}
