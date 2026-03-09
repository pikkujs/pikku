import React, { useMemo } from 'react'
import { usePikkuMeta } from '@/context/PikkuMetaContext'
import { ProjectSecrets } from '@/components/project/ProjectSecrets'

export const SecretsTab: React.FunctionComponent = () => {
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

  return <ProjectSecrets secrets={secrets} loading={loading} />
}
