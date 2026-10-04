import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { m } from '@/i18n/messages'

export function HeaderTabs() {
  return (
    <header className="border-b">
      <div className="mx-auto max-w-6xl px-6 pt-3">
        <span className="font-semibold">{m.headertabs__brand()}</span>
        <Tabs defaultValue="overview" className="mt-3">
          <TabsList>
            <TabsTrigger value="overview">{m.headertabs__overview()}</TabsTrigger>
            <TabsTrigger value="members">{m.headertabs__members()}</TabsTrigger>
            <TabsTrigger value="settings">{m.headertabs__settings()}</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">{m.headertabs__overview_text()}</TabsContent>
          <TabsContent value="members">{m.headertabs__members_text()}</TabsContent>
          <TabsContent value="settings">{m.headertabs__settings_text()}</TabsContent>
        </Tabs>
      </div>
    </header>
  )
}
