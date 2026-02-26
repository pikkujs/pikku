import React, { useMemo } from 'react'
import { Variable } from 'lucide-react'
import { usePikkuMeta } from '@/context/PikkuMetaContext'
import { PanelProvider } from '@/context/PanelContext'
import { ResizablePanelLayout } from '@/components/layout/ResizablePanelLayout'
import { DetailPageHeader } from '@/components/layout/DetailPageHeader'
import { ProjectVariables } from '@/components/project/ProjectVariables'

const VariablesPageContent: React.FunctionComponent = () => {
  const { meta, loading } = usePikkuMeta()

  const variables = useMemo(() => {
    if (!meta.variablesMeta) return []
    return Object.entries(meta.variablesMeta).map(
      ([name, data]: [string, any]) => ({
        name,
        displayName: data.displayName,
        description: data.description,
        variableId: data.variableId,
        rawData: data,
      })
    )
  }, [meta.variablesMeta])

  return (
    <ResizablePanelLayout
      header={
        <DetailPageHeader
          icon={Variable}
          category="Variables"
          docsHref="https://pikku.dev/docs/core-features/variables"
        />
      }
    >
      <ProjectVariables variables={variables} loading={loading} />
    </ResizablePanelLayout>
  )
}

export const VariablesPage: React.FunctionComponent = () => {
  return (
    <PanelProvider>
      <VariablesPageContent />
    </PanelProvider>
  )
}
