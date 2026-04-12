import React, { useMemo } from 'react'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { ProjectVariables } from '../project/ProjectVariables'

export const VariablesTab: React.FunctionComponent = () => {
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

  return <ProjectVariables variables={variables} loading={loading} />
}
