import React, { useMemo } from 'react'
import { KeyRound } from 'lucide-react'
import { usePikkuMeta } from '@/context/PikkuMetaContext'
import { PanelProvider } from '@/context/PanelContext'
import { ResizablePanelLayout } from '@/components/layout/ResizablePanelLayout'
import { DetailPageHeader } from '@/components/layout/DetailPageHeader'
import { ProjectSecrets } from '@/components/project/ProjectSecrets'

const SecretsPageContent: React.FunctionComponent = () => {
  const { meta, loading } = usePikkuMeta()

  const secrets = useMemo(() => {
    if (!meta.secretsMeta) return []
    return Object.entries(meta.secretsMeta).map(
      ([name, data]: [string, any]) => ({
        name,
        displayName: data.displayName,
        description: data.description,
        secretId: data.secretId,
        isOAuth2: !!data.oauth2,
        rawData: data,
      })
    )
  }, [meta.secretsMeta])

  return (
    <ResizablePanelLayout
      header={
        <DetailPageHeader
          icon={KeyRound}
          category="Secrets"
          docsHref="https://pikkujs.com/docs/secrets"
        />
      }
    >
      <ProjectSecrets secrets={secrets} loading={loading} />
    </ResizablePanelLayout>
  )
}

export const SecretsPage: React.FunctionComponent = () => {
  return (
    <PanelProvider>
      <SecretsPageContent />
    </PanelProvider>
  )
}
