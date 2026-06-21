import React, { useMemo } from 'react'
import { Box, Text, Group, Tabs } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { useFunctionMeta, useSchema } from '../../hooks/useWirings'
import { usePanelContext } from '../../context/PanelContext'
import { SchemaSection } from '../project/panels/shared/SchemaSection'
import { CopyableCode } from '../ui/CopyableCode'
import { PikkuBadge } from '../ui/PikkuBadge'
import { LinkedBadge } from '../project/panels/LinkedBadge'
import { MetaRow } from '../ui/MetaRow'
import { SectionLabel } from '../ui/SectionLabel'
import { TagBadge } from '../ui/TagBadge'
import classes from '../ui/console.module.css'
import {
  generateCurlSnippet,
  generateFetchSnippet,
  generatePikkuFetchSnippet,
} from './httpSnippets'

interface HttpTabbedPanelProps {
  wireId: string
  metadata: any
}

export const HttpTabbedPanel: React.FC<HttpTabbedPanelProps> = ({
  wireId,
  metadata,
}) => {
  const { navigateInPanel } = usePanelContext()
  const { data: funcMeta } = useFunctionMeta(metadata?.pikkuFuncId || '')
  const inputSchemaName = funcMeta?.inputSchemaName
  const outputSchemaName = funcMeta?.outputSchemaName
  const { data: inputSchema } = useSchema(inputSchemaName)

  useLocale()
  const method = (metadata?.method || 'GET').toUpperCase()
  const route = metadata?.route || '/'
  const funcId = metadata?.pikkuFuncId
  const displayName = funcMeta?.name || funcId

  const curlSnippet = useMemo(
    () => generateCurlSnippet(metadata, inputSchema),
    [metadata, inputSchema]
  )
  const fetchSnippet = useMemo(
    () => generateFetchSnippet(metadata, inputSchema),
    [metadata, inputSchema]
  )
  const pikkuSnippet = useMemo(
    () => generatePikkuFetchSnippet(metadata, inputSchema),
    [metadata, inputSchema]
  )

  return (
    <Box className={classes.flexColumn}>
      <Box
        className={`${classes.detailHeader} ${classes.noShrink}`}
        style={{ background: 'rgba(255,255,255,0.01)' }}
      >
        <PikkuBadge type="httpMethod" value={method} />
        <Box className={classes.flexGrow}>
          <Text size="sm" ff="monospace" fw={600} c="gray.2">
            {asI18n(route)}
          </Text>
          <Text size="sm" c="dimmed">
            {asI18n(displayName ?? '')}
          </Text>
        </Box>
        <Group gap={6}>
          {metadata?.auth !== false && <PikkuBadge type="flag" flag="auth" />}
          {metadata?.sse && <PikkuBadge type="flag" flag="sse" />}
          {metadata?.tags?.map((tag: string) => (
            <TagBadge key={tag}>{asI18n(tag)}</TagBadge>
          ))}
        </Group>
      </Box>

      <Box className={classes.flexRow}>
        <Box className={classes.splitLeft}>
          <SectionLabel>{m.http_section_handler()}</SectionLabel>

          {funcId && (
            <MetaRow label={m.http_meta_function()}>
              <Text
                size="sm"
                fw={600}
                ff="monospace"
                c="var(--app-meta-value)"
                className={classes.clickableText}
                onClick={() =>
                  navigateInPanel('function', funcId, displayName, funcMeta)
                }
              >
                {asI18n(displayName ?? '')}
              </Text>
            </MetaRow>
          )}

          {metadata?.sse && (
            <MetaRow label={m.http_meta_transport()}>
              <Text size="sm" c="gray.4">
                {m.http_transport_sse()}
              </Text>
            </MetaRow>
          )}

          {metadata?.middleware && metadata.middleware.length > 0 && (
            <MetaRow label={m.http_meta_middleware()}>
              <Group gap={4}>
                {metadata.middleware.map((mw: any, i: number) => (
                  <LinkedBadge key={i} item={mw} kind="middleware" />
                ))}
              </Group>
            </MetaRow>
          )}

          {metadata?.permissions && metadata.permissions.length > 0 && (
            <MetaRow label={m.http_meta_permissions()}>
              <Group gap={4}>
                {metadata.permissions.map((p: any, i: number) => (
                  <LinkedBadge key={i} item={p} kind="permission" />
                ))}
              </Group>
            </MetaRow>
          )}

          {funcMeta?.services && funcMeta.services.services.length > 0 && (
            <MetaRow label={m.http_meta_services()}>
              <Group gap={4}>
                {funcMeta.services.services.map((svc: string) => (
                  <PikkuBadge
                    key={svc}
                    type="dynamic"
                    badge="service"
                    value={svc}
                  />
                ))}
              </Group>
            </MetaRow>
          )}

          {inputSchemaName && (
            <>
              <SectionLabel>{m.http_section_input_schema()}</SectionLabel>
              <SchemaSection schemaName={inputSchemaName} />
            </>
          )}

          {outputSchemaName && (
            <>
              <SectionLabel>{m.http_section_output_schema()}</SectionLabel>
              <SchemaSection schemaName={outputSchemaName} />
            </>
          )}
        </Box>

        <Box
          className={`${classes.flexGrow} ${classes.flexColumn} ${classes.overflowHidden}`}
        >
          <Tabs
            defaultValue="pikku-fetch"
            className={classes.flexColumn}
            style={{ minHeight: 0 }}
          >
            <Tabs.List>
              <Tabs.Tab value="pikku-fetch">{asI18n('pikku-fetch')}</Tabs.Tab>
              <Tabs.Tab value="fetch">{asI18n('fetch')}</Tabs.Tab>
              <Tabs.Tab value="curl">{asI18n('curl')}</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel
              value="pikku-fetch"
              className={`${classes.flexGrow} ${classes.overflowAuto}`}
              p="sm"
            >
              <CopyableCode code={pikkuSnippet} language="typescript" />
            </Tabs.Panel>
            <Tabs.Panel
              value="fetch"
              className={`${classes.flexGrow} ${classes.overflowAuto}`}
              p="sm"
            >
              <CopyableCode code={fetchSnippet} language="typescript" />
            </Tabs.Panel>
            <Tabs.Panel
              value="curl"
              className={`${classes.flexGrow} ${classes.overflowAuto}`}
              p="sm"
            >
              <CopyableCode code={curlSnippet} language="bash" />
            </Tabs.Panel>
          </Tabs>
        </Box>
      </Box>
    </Box>
  )
}
