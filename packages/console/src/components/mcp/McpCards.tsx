import React from 'react'
import {
  ActionIcon,
  Stack,
  Tabs,
  Text,
  TextInput,
} from '@pikku/mantine/core'
import { asI18n, type I18nNode } from '@pikku/react'
import {
  BookOpen,
  ChevronRight,
  Cpu,
  MessageSquareText,
  Wrench,
} from 'lucide-react'
import { m } from '@/i18n/messages'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { usePanelContext } from '../../context/PanelContext'
import { usePanelUrl } from '../../hooks/usePanelUrl'
import { getServerUrl } from '../../context/serverUrl'
import { useSchema } from '../../hooks/useWirings'
import { useMcpItems } from '../../hooks/useMcpItems'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'
import { SectionCard } from '../ui/SectionCard'
import { CardRow } from '../ui/CardRow'
import { StatusTile } from '../ui/StatusTile'
import { StatusBadge } from '../ui/StatusBadge'
import { ForDevelopers } from '../ui/ForDevelopers'
import {
  DevCode,
  DevCopy,
  DevField,
  DevFields,
  DevNote,
  devSourcePath,
} from '../ui/DevDetail'

const DOCS = 'https://pikku.dev/docs/wiring/mcp'

type McpMethod = 'tool' | 'resource' | 'prompt'

export type McpItem = {
  method: McpMethod
  name?: string
  wireId?: string
  title?: string
  description?: string
  summary?: string
  uri?: string
  pikkuFuncId?: string
  inputSchema?: string | null
  outputSchema?: string | null
  arguments?: { name: string; description?: string; required?: boolean }[]
}

const idOf = (item: McpItem) => item.name || item.wireId || item.uri || ''

const readable = (value: string) => {
  const words = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_./:{}]+/g, ' ')
    .trim()
    .toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const serverName = (url: string) => {
  try {
    const label = new URL(url).hostname.split('.')[0]
    return label && label !== 'localhost' ? label : 'my-app'
  } catch {
    return 'my-app'
  }
}

const SchemaBlock: React.FC<{ name: string; label: I18nNode }> = ({
  name,
  label,
}) => {
  const { data } = useSchema(name)
  if (!data) return null
  return (
    <DevCode
      code={JSON.stringify(data, null, 2)}
      language="json"
      label={label}
    />
  )
}

const LOOK: Record<McpMethod, typeof Wrench> = {
  tool: Wrench,
  resource: BookOpen,
  prompt: MessageSquareText,
}

const describe = (item: McpItem, functions: any[] | undefined) => {
  const funcMeta = functions?.find(
    (f: any) => f.pikkuFuncId === item.pikkuFuncId
  )
  return {
    funcMeta,
    text:
      item.description ||
      item.summary ||
      funcMeta?.description ||
      funcMeta?.summary,
  }
}

const titleOf = (item: McpItem) =>
  item.title || readable(item.name || idOf(item))

const panelIdOf = (item: McpItem) =>
  `mcp::${item.method}::${item.wireId || item.name}`

export const McpDetail: React.FC<{ item: McpItem }> = ({ item }) => {
  const { meta } = usePikkuMeta()
  const { funcMeta, text } = describe(item, meta.functions)
  const id = idOf(item)
  const args = item.arguments ?? []

  return (
    <Stack gap="md" data-testid={`mcp-detail-${item.method}-${id}`}>
      <Text size="sm" c={text ? undefined : 'dimmed'}>
        {text ? asI18n(text) : m.wires_mcp_row_no_description_hint()}
      </Text>
      {args.length > 0 && (
        <Stack gap={6}>
          <Text size="sm" c="dimmed">
            {m.wires_mcp_prompt_asks_title()}
          </Text>
          {args.map((arg) => (
            <Text size="sm" key={arg.name}>
              <Text span fw={600}>
                {asI18n(arg.name)}
              </Text>
              {asI18n(' — ')}
              {arg.description
                ? asI18n(arg.description)
                : arg.required
                  ? m.wires_mcp_input_required()
                  : m.wires_mcp_input_optional()}
            </Text>
          ))}
        </Stack>
      )}
      <ForDevelopers testId={`mcp-dev-${item.method}-${id}`}>
        <DevFields>
          {item.name && (
            <DevField
              label={m.wires_mcp_dev_name()}
              value={item.name}
              mono
              copy
            />
          )}
          {item.uri && (
            <DevField label={m.wires_mcp_dev_uri()} value={item.uri} mono copy />
          )}
          {item.pikkuFuncId && (
            <DevField label={m.dev_function()} value={item.pikkuFuncId} />
          )}
          {funcMeta?.sourceFile && (
            <DevField
              label={m.dev_source()}
              value={devSourcePath(funcMeta.sourceFile)}
            />
          )}
        </DevFields>
        {item.inputSchema && (
          <SchemaBlock
            name={item.inputSchema}
            label={m.wires_mcp_dev_input({ schema: item.inputSchema })}
          />
        )}
      </ForDevelopers>
    </Stack>
  )
}

const McpRow: React.FC<{
  item: McpItem
  selected: boolean
  onOpen: () => void
}> = ({ item, selected, onOpen }) => {
  const { meta } = usePikkuMeta()
  const id = idOf(item)
  const { text } = describe(item, meta.functions)
  const Icon = LOOK[item.method]
  const args = item.arguments ?? []

  const metaLine: I18nNode[] = [
    text ? asI18n(text) : m.wires_mcp_row_no_description(),
    ...(item.method === 'prompt' && args.length > 0
      ? [
          args.length === 1
            ? m.wires_mcp_row_asks_one()
            : m.wires_mcp_row_asks({ count: args.length }),
        ]
      : []),
  ]

  return (
    <CardRow
      testId={`mcp-${item.method}-${id}`}
      onClick={onOpen}
      selected={selected}
      leading={
        <StatusTile tone="info">
          <Icon size={18} />
        </StatusTile>
      }
      title={asI18n(titleOf(item))}
      badges={
        text ? undefined : (
          <StatusBadge tone="warn" size="sm">
            {m.wires_mcp_row_unexplained()}
          </StatusBadge>
        )
      }
      meta={metaLine.map((part, index) => (
        <React.Fragment key={index}>
          {index > 0 && asI18n(' · ')}
          {part}
        </React.Fragment>
      ))}
      trailing={
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label={m.wires_mcp_row_show()}
          onClick={onOpen}
        >
          <ChevronRight size={16} />
        </ActionIcon>
      }
    />
  )
}

const ConnectCard: React.FC = () => {
  const address = `${getServerUrl().replace(/\/$/, '')}/mcp`
  const name = serverName(address)
  const snippets = [
    {
      key: 'claude-desktop',
      label: m.wires_mcp_client_claude_desktop(),
      how: m.wires_mcp_client_claude_desktop_how(),
      language: 'json',
      code: JSON.stringify(
        {
          mcpServers: {
            [name]: { command: 'npx', args: ['mcp-remote', address] },
          },
        },
        null,
        2
      ),
    },
    {
      key: 'claude-code',
      label: m.wires_mcp_client_claude_code(),
      how: m.wires_mcp_client_claude_code_how(),
      language: 'bash',
      code: `claude mcp add --transport http ${name} ${address}`,
    },
    {
      key: 'cursor',
      label: m.wires_mcp_client_cursor(),
      how: m.wires_mcp_client_cursor_how(),
      language: 'json',
      code: JSON.stringify(
        { mcpServers: { [name]: { url: address } } },
        null,
        2
      ),
    },
  ]

  return (
    <SectionCard
      testId="mcp-connect"
      eyebrow={
        <Text size="sm" c="dimmed" mb={4}>
          {m.wires_mcp_connect_eyebrow()}
        </Text>
      }
      title={m.wires_mcp_connect_title()}
      blurb={m.wires_mcp_connect_blurb()}
      footer={
        <ForDevelopers testId="mcp-connect-dev" attached>
          <DevNote>{m.wires_mcp_connect_dev_note()}</DevNote>
        </ForDevelopers>
      }
    >
      <Stack gap="md" mt="md">
        <TextInput
          readOnly
          label={m.wires_mcp_connect_address()}
          value={address}
          styles={{
            input: { fontFamily: 'var(--mantine-font-family-monospace)' },
          }}
          rightSection={<DevCopy value={address} />}
          data-testid="mcp-connect-address"
        />
        <Tabs defaultValue={snippets[0].key}>
          <Tabs.List>
            {snippets.map((snippet) => (
              <Tabs.Tab key={snippet.key} value={snippet.key}>
                {snippet.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          {snippets.map((snippet) => (
            <Tabs.Panel key={snippet.key} value={snippet.key} pt="md">
              <DevCode
                code={snippet.code}
                language={snippet.language}
                label={snippet.how}
              />
            </Tabs.Panel>
          ))}
        </Tabs>
      </Stack>
    </SectionCard>
  )
}

const SECTIONS: {
  method: McpMethod
  eyebrow: () => I18nNode
  title: () => I18nNode
  blurb: () => I18nNode
  count: (count: number) => I18nNode
}[] = [
  {
    method: 'tool',
    eyebrow: () => m.wires_mcp_tools_eyebrow(),
    title: () => m.wires_mcp_tools_title(),
    blurb: () => m.wires_mcp_tools_blurb(),
    count: (count) =>
      count === 1
        ? m.wires_mcp_tools_count_one()
        : m.wires_mcp_tools_count({ count }),
  },
  {
    method: 'resource',
    eyebrow: () => m.wires_mcp_resources_eyebrow(),
    title: () => m.wires_mcp_resources_title(),
    blurb: () => m.wires_mcp_resources_blurb(),
    count: (count) =>
      count === 1
        ? m.wires_mcp_resources_count_one()
        : m.wires_mcp_resources_count({ count }),
  },
  {
    method: 'prompt',
    eyebrow: () => m.wires_mcp_prompts_eyebrow(),
    title: () => m.wires_mcp_prompts_title(),
    blurb: () => m.wires_mcp_prompts_blurb(),
    count: (count) =>
      count === 1
        ? m.wires_mcp_prompts_count_one()
        : m.wires_mcp_prompts_count({ count }),
  },
]

export const McpCards: React.FC<{
  searchQuery?: string
  emptyHero?: React.ReactNode
}> = ({ searchQuery = '', emptyHero }) => {
  const { items, loading } = useMcpItems()
  const all = items as McpItem[]
  const { openPanel, activePanel } = usePanelContext()
  const open = (id: string, item: McpItem) =>
    openPanel('mcp', id, titleOf(item), { item })

  usePanelUrl({ type: 'mcp', items: all, getId: panelIdOf, open })

  if (loading && all.length === 0) return null

  if (all.length === 0) {
    return (
      <EmptyStatePlaceholder
        icon={Cpu}
        hero={emptyHero}
        title={m.wires_mcp_empty_title()}
        description={m.wires_mcp_empty_description()}
        docsHref={DOCS}
      />
    )
  }

  const query = searchQuery.trim().toLowerCase()
  const matches = (item: McpItem) =>
    !query ||
    [item.name, item.title, item.description, item.summary, item.uri]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(query))

  const groups = SECTIONS.map((section) => {
    const own = all.filter((item) => item.method === section.method)
    return { section, own, shown: own.filter(matches) }
  }).filter(({ own, shown }) => own.length > 0 && (!query || shown.length > 0))

  return (
    <>
      <ConnectCard />
      {query && groups.length === 0 && (
        <Text size="sm" c="dimmed" ta="center" py="xl">
          {m.wires_mcp_search_no_match({ query: searchQuery })}
        </Text>
      )}
      {groups.map(({ section, own, shown }) => (
        <SectionCard
          key={section.method}
          testId={`mcp-section-${section.method}`}
          eyebrow={
            <Text size="sm" c="dimmed" mb={4}>
              {section.eyebrow()}
            </Text>
          }
          title={section.title()}
          subtitle={section.count(own.length)}
          blurb={section.blurb()}
        >
          <Stack gap="xs" mt="md">
            {shown.map((item) => (
              <McpRow
                key={idOf(item)}
                item={item}
                selected={activePanel === `mcp-${panelIdOf(item)}`}
                onOpen={() => open(panelIdOf(item), item)}
              />
            ))}
          </Stack>
        </SectionCard>
      ))}
    </>
  )
}
