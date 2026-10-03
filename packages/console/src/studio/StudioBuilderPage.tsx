import React from 'react'
import { Button } from '@pikku/mantine/core'
import { Plus } from 'lucide-react'
import { m } from '@/i18n/messages'
import { PageContainer, PageHeader } from '../components/layout/PageLayout'
import { BuilderChat, useBuilderState, type BuilderState } from './BuilderChat'
import { openProjectKey, useStudioAction } from './studio'

export const StudioBuilderPage: React.FC = () => {
  const key = openProjectKey()
  const state = useBuilderState(key ?? '')
  const clear = useStudioAction<{ key: string }, BuilderState>('builderClear')
  if (!key) return null
  return (
    <PageContainer
      noPadding
      fullWidth
      style={{ display: 'flex', flexDirection: 'column' }}
      header={
        <PageHeader
          title={m.studio_builder_title()}
          actions={
            <Button
              size="xs"
              variant="default"
              leftSection={<Plus size={14} />}
              disabled={!state.data?.items.length}
              loading={clear.isPending}
              onClick={() => clear.mutate({ key })}
              data-testid="builder-new"
            >
              {m.studio_builder_new()}
            </Button>
          }
        />
      }
    >
      <BuilderChat projectKey={key} />
    </PageContainer>
  )
}
