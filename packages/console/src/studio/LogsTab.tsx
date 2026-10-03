import { useEffect, useRef, useState } from 'react'
import { Button, Group, Stack, Text } from '@pikku/mantine/core'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ScrollText, Wrench } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { PikkuToggle } from '../components/builder/PikkuToggle'
import { addChatRef } from './chatRefs'
import { studioCall } from './studio'

interface LogSource {
  id: string
  lines: string[]
}

const ERROR = /\b\w*(Error|Exception)\b:|\b(ERROR|FATAL|error|fatal|failed)\b[:\]]|\[(error|ERROR)\]|\bUnhandled\b|\buncaught\b|\bERR_[A-Z_]+|^\s*[✘✖]|^\s+at\s/
const WARN = /\b(WARN|warn|warning|Warning)\b[:\]]|^\s*⚠/

const lastError = (lines: string[]) => {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (ERROR.test(lines[i]!) && !/^\s+at\s/.test(lines[i]!)) return i
  }
  return -1
}

const sourceLabel = (id: string) => (id === 'server' ? m.studio_logs_server() : m.studio_logs_app({ slug: id }))

export function LogsTab({ projectKey }: { projectKey: string }) {
  const logs = useQuery({
    queryKey: ['studio', 'logs', projectKey],
    queryFn: () => studioCall<{ sources: LogSource[] }>('projectLogs', { key: projectKey }),
    refetchInterval: 2000,
  })
  const sources = logs.data?.sources ?? []
  const [chosen, setChosen] = useState('server')
  const source = sources.find((s) => s.id === chosen) ?? sources[0]
  const box = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  useEffect(() => {
    if (box.current && pinned.current) box.current.scrollTop = box.current.scrollHeight
  }, [source?.lines.length, source?.id])

  if (!source) {
    return (
      <Stack align="center" gap={6} p="xl" style={{ flex: 1 }} data-testid="logs-empty">
        <ScrollText size={20} />
        <Text size="sm" c="dimmed" ta="center">
          {m.studio_logs_empty()}
        </Text>
      </Stack>
    )
  }

  const errorAt = lastError(source.lines)
  const ask = () => {
    const context = source.lines.slice(Math.max(0, errorAt - 3), errorAt + 15).join('\n')
    addChatRef({
      id: `log:${source.id}:${source.lines[errorAt]}`,
      label: m.studio_logs_ref({ source: sourceLabel(source.id) }),
      title: source.lines[errorAt]!,
      text: `this error from the ${source.id === 'server' ? 'server' : `${source.id} app`} log:\n\`\`\`\n${context}\n\`\`\`\n`,
    })
  }

  return (
    <Stack gap={0} style={{ flex: 1, minHeight: 0 }} data-testid="logs-tab">
      {sources.length > 1 && (
        <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--app-border)' }}>
          <PikkuToggle
            value={source.id}
            onChange={setChosen}
            items={sources.map((s) => ({ value: s.id, label: sourceLabel(s.id), 'data-testid': `logs-source-${s.id}` }))}
          />
        </div>
      )}
      {errorAt >= 0 && (
        <Group gap={8} wrap="nowrap" p="xs" style={{ borderBottom: '1px solid var(--app-border)', background: 'var(--app-red-soft, rgba(250,82,82,0.08))' }}>
          <AlertTriangle size={14} color="var(--mantine-color-red-6)" style={{ flexShrink: 0 }} />
          <Text size="xs" style={{ flex: 1, minWidth: 0 }} truncate title={asI18n(source.lines[errorAt]!)}>
            {asI18n(source.lines[errorAt]!)}
          </Text>
          <Button size="compact-xs" leftSection={<Wrench size={12} />} onClick={ask} data-testid="logs-ask-builder">
            {m.studio_logs_ask()}
          </Button>
        </Group>
      )}
      <div
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
        style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '8px 10px', fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 11, lineHeight: 1.5 }}
        data-testid="logs-lines"
      >
        {source.lines.map((line, index) => (
          <div
            key={index}
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: ERROR.test(line) ? 'var(--mantine-color-red-5)' : WARN.test(line) ? 'var(--mantine-color-orange-5)' : 'var(--app-text-muted, inherit)',
            }}
          >
            {line}
          </div>
        ))}
      </div>
    </Stack>
  )
}
