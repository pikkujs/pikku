import React, { useMemo } from 'react'
import { Text, Group } from '@mantine/core'
import { KeyRound } from 'lucide-react'
import { usePikkuMeta } from '@/context/PikkuMetaContext'
import { PanelProvider, usePanelContext } from '@/context/PanelContext'
import { ResizablePanelLayout } from '@/components/layout/ResizablePanelLayout'
import { DetailPageHeader } from '@/components/layout/DetailPageHeader'
import { TableListPage } from '@/components/layout/TableListPage'
import { PikkuBadge } from '@/components/ui/PikkuBadge'

interface SecretItem {
  name: string
  displayName: string
  description?: string
  secretId: string
  isOAuth2: boolean
  rawData: any
}

const SecretsTable: React.FunctionComponent<{
  items: SecretItem[]
  loading?: boolean
}> = ({ items, loading }) => {
  const { openSecret } = usePanelContext()

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'NAME',
        render: (item: SecretItem) => (
          <>
            <Group gap="xs">
              <Text fw={500} truncate>
                {item.displayName}
              </Text>
              {item.isOAuth2 && (
                <PikkuBadge type="label" color="violet">
                  OAuth2
                </PikkuBadge>
              )}
            </Group>
            {item.description && (
              <Text size="xs" c="dimmed" truncate>
                {item.description}
              </Text>
            )}
          </>
        ),
      },
    ],
    []
  )

  return (
    <TableListPage
      title="Secrets"
      icon={KeyRound}
      docsHref="https://pikkujs.com/docs/secrets"
      data={items}
      columns={columns}
      getKey={(item) => item.name}
      onRowClick={(item) => openSecret(item.name, item.rawData)}
      searchPlaceholder="Search secrets..."
      searchFilter={(item, q) =>
        item.name.toLowerCase().includes(q) ||
        item.displayName.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q) ||
        item.secretId.toLowerCase().includes(q) ||
        false
      }
      emptyMessage="No secrets found."
      loading={loading}
    />
  )
}

const SecretsPageContent: React.FunctionComponent = () => {
  const { meta, loading } = usePikkuMeta()

  const items = useMemo((): SecretItem[] => {
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
      <SecretsTable items={items} loading={loading} />
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
