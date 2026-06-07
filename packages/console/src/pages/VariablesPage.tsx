import React, { useMemo } from 'react'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { ProjectVariables } from '../components/project/ProjectVariables'

const VariablesPageContent: React.FC = () => {
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
    <ResizablePanelLayout header={<ListPageHeader title="Variables" description="Runtime configuration variables for this environment" />}>
      <ProjectVariables variables={variables} loading={loading} />
    </ResizablePanelLayout>
  )
}

export const VariablesPage: React.FC = () => {
  return (
    <PanelProvider>
      <VariablesPageContent />
    </PanelProvider>
  )
}
