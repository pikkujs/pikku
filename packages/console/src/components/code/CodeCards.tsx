import React, { useMemo } from 'react'
import {
  ActionIcon,
  Alert,
  Anchor,
  Box,
  Breadcrumbs,
  Button,
  Group,
  SimpleGrid,
  Stack,
  Text,
} from '@pikku/mantine/core'
import { CodeHighlight } from '@mantine/code-highlight'
import '../ui/code-highlight-styles'
import { asI18n, type I18nNode, type I18nString } from '@pikku/react'
import {
  ChevronRight,
  CloudDownload,
  CloudUpload,
  File,
  FileCode,
  FileDiff,
  FileImage,
  FileJson,
  FileMinus,
  FilePlus,
  FileText,
  Folder,
  GitCommitHorizontal,
  TriangleAlert,
} from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { plural } from '@/i18n/plural'
import { SectionCard } from '../ui/SectionCard'
import { CardRow } from '../ui/CardRow'
import { StatusTile } from '../ui/StatusTile'
import {
  STATUS_TONE_COLOR,
  StatusBadge,
  type StatusTone,
} from '../ui/StatusBadge'
import { ForDevelopers } from '../ui/ForDevelopers'
import {
  DevCode,
  DevField,
  DevFields,
  DevNote,
  DevTable,
} from '../ui/DevDetail'
import { ConsoleLoading } from '../ui/ConsoleLoading'
import { runAgo, runWhen } from '../scenarios/runs/scenario-run-format'
import {
  errorText,
  type GitCommit,
  type GitDiff,
  type GitFileStatus,
  type GitPullResult,
  type GitPushResult,
  type GitStatus,
  type GitStatusEntry,
  type WorkspaceEntry,
  type WorkspaceFile,
} from '../../hooks/useProjectCode'

type Kind =
  | 'folder'
  | 'code'
  | 'settings'
  | 'document'
  | 'styles'
  | 'page'
  | 'image'
  | 'data'
  | 'file'

const EXT_KIND: Record<string, Kind> = {
  ts: 'code',
  tsx: 'code',
  js: 'code',
  jsx: 'code',
  mjs: 'code',
  cjs: 'code',
  json: 'settings',
  jsonc: 'settings',
  yaml: 'settings',
  yml: 'settings',
  toml: 'settings',
  env: 'settings',
  md: 'document',
  mdx: 'document',
  txt: 'document',
  css: 'styles',
  scss: 'styles',
  html: 'page',
  svg: 'image',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  ico: 'image',
  sql: 'data',
  csv: 'data',
  lock: 'data',
}

const KIND_LABEL: Record<Kind, () => I18nString> = {
  folder: m.code_kind_folder,
  code: m.code_kind_code,
  settings: m.code_kind_settings,
  document: m.code_kind_document,
  styles: m.code_kind_styles,
  page: m.code_kind_page,
  image: m.code_kind_image,
  data: m.code_kind_data,
  file: m.code_kind_file,
}

const KIND_ICON: Record<Kind, typeof File> = {
  folder: Folder,
  code: FileCode,
  settings: FileJson,
  document: FileText,
  styles: FileCode,
  page: FileCode,
  image: FileImage,
  data: FileText,
  file: File,
}

const LANGUAGE: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  jsonc: 'json',
  md: 'markdown',
  mdx: 'markdown',
  css: 'css',
  scss: 'scss',
  html: 'xml',
  svg: 'xml',
  sql: 'sql',
  yaml: 'yaml',
  yml: 'yaml',
  sh: 'bash',
  toml: 'ini',
}

const extOf = (path: string) => {
  const name = baseName(path)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export const baseName = (path: string) => path.split('/').pop() || path

export const parentOf = (path: string) =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''

const kindOf = (path: string, type: WorkspaceEntry['type'] = 'file'): Kind =>
  type === 'directory' ? 'folder' : (EXT_KIND[extOf(path)] ?? 'file')

const STATUS_LABEL: Record<GitFileStatus, () => I18nString> = {
  modified: m.code_status_modified,
  staged: m.code_status_staged,
  untracked: m.code_status_untracked,
  deleted: m.code_status_deleted,
  renamed: m.code_status_renamed,
  conflicted: m.code_status_conflicted,
}

const STATUS_TONE: Record<GitFileStatus, StatusTone> = {
  modified: 'info',
  staged: 'info',
  untracked: 'good',
  deleted: 'bad',
  renamed: 'info',
  conflicted: 'warn',
}

const STATUS_ICON: Record<GitFileStatus, typeof File> = {
  modified: FileDiff,
  staged: FileDiff,
  untracked: FilePlus,
  deleted: FileMinus,
  renamed: FileDiff,
  conflicted: TriangleAlert,
}

const useSize = () => {
  const { locale } = useLocale()
  return (bytes: number) => {
    const units = ['byte', 'kilobyte', 'megabyte'] as const
    let value = bytes
    let unit = 0
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024
      unit++
    }
    try {
      return new Intl.NumberFormat(locale, {
        style: 'unit',
        unit: units[unit],
        unitDisplay: 'short',
        maximumFractionDigits: unit === 0 ? 0 : 1,
      }).format(value)
    } catch {
      return `${bytes}`
    }
  }
}

const Fact: React.FC<{ label: I18nNode; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <Stack gap={4} miw={0}>
    <Text size="sm" c="dimmed">
      {label}
    </Text>
    <Box fz="sm" fw={500} style={{ overflowWrap: 'anywhere' }}>
      {children}
    </Box>
  </Stack>
)

const CodeView: React.FC<{ code: string; language: string }> = ({
  code,
  language,
}) => (
  <CodeHighlight
    mt="md"
    code={code}
    language={language}
    radius="md"
    copyLabel={m.common_copy()}
    copiedLabel={m.common_copied()}
    styles={{
      pre: { whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
      code: { whiteSpace: 'pre-wrap' },
    }}
  />
)

const StatusBadgeFor: React.FC<{
  status: GitFileStatus
  size?: 'sm' | 'lg'
}> = ({ status, size = 'sm' }) => (
  <StatusBadge tone={STATUS_TONE[status]} size={size}>
    {STATUS_LABEL[status]()}
  </StatusBadge>
)

const Chevron: React.FC<{ name: string; onOpen: () => void }> = ({
  name,
  onOpen,
}) => (
  <ActionIcon
    variant="subtle"
    color="gray"
    aria-label={m.code_open({ name })}
    onClick={onOpen}
  >
    <ChevronRight size={16} />
  </ActionIcon>
)

const FolderTrail: React.FC<{
  dir: string
  onOpenDir: (dir: string) => void
}> = ({ dir, onOpenDir }) => {
  const parts = dir ? dir.split('/') : []
  return (
    <Breadcrumbs separatorMargin={6} data-testid="code-trail">
      <Anchor component="button" size="sm" onClick={() => onOpenDir('')}>
        {m.code_files_root()}
      </Anchor>
      {parts.map((part, index) => {
        const path = parts.slice(0, index + 1).join('/')
        return index === parts.length - 1 ? (
          <Text key={path} size="sm" fw={600}>
            {asI18n(part)}
          </Text>
        ) : (
          <Anchor
            key={path}
            component="button"
            size="sm"
            onClick={() => onOpenDir(path)}
          >
            {asI18n(part)}
          </Anchor>
        )
      })}
    </Breadcrumbs>
  )
}

const changeIndex = (status: GitStatus | undefined) => {
  const byPath = new Map<string, GitStatusEntry>()
  const dirs = new Set<string>()
  for (const file of status?.files ?? []) {
    byPath.set(file.path, file)
    let dir = parentOf(file.path)
    while (dir) {
      dirs.add(dir)
      dir = parentOf(dir)
    }
  }
  return { byPath, dirs }
}

export const FilesOverviewCards: React.FC<{
  dir: string
  entries: WorkspaceEntry[] | undefined
  loading: boolean
  error: unknown
  status: GitStatus | undefined
  searchQuery: string
  onOpenDir: (dir: string) => void
  onOpenFile: (path: string) => void
  onSeeChanges: () => void
}> = ({
  dir,
  entries,
  loading,
  error,
  status,
  searchQuery,
  onOpenDir,
  onOpenFile,
  onSeeChanges,
}) => {
  useLocale()
  const changes = useMemo(() => changeIndex(status), [status])
  const query = searchQuery.trim().toLowerCase()
  const shown = (entries ?? []).filter(
    (entry) => !query || entry.name.toLowerCase().includes(query)
  )
  const count = entries?.length ?? 0

  return (
    <>
      <SectionCard
        hero
        testId="code-files-hero"
        title={m.code_files_title()}
        blurb={m.code_files_blurb()}
      >
        {status && (
          <Group gap={8} mt="md" data-testid="code-files-changes">
            <Text size="sm" c="dimmed">
              {m.code_fact_since_save()}
            </Text>
            {status.files.length ? (
              <>
                <StatusBadge tone="info" size="sm">
                  {plural(
                    status.files.length,
                    m.code_files_changed_one,
                    m.code_files_changed
                  )}
                </StatusBadge>
                <Anchor component="button" size="sm" onClick={onSeeChanges}>
                  {m.code_see_changes()}
                </Anchor>
              </>
            ) : (
              <StatusBadge tone="good" size="sm">
                {m.code_badge_saved()}
              </StatusBadge>
            )}
          </Group>
        )}
      </SectionCard>

      <SectionCard
        testId="code-files-list"
        eyebrow={
          dir ? <FolderTrail dir={dir} onOpenDir={onOpenDir} /> : undefined
        }
        title={dir ? asI18n(baseName(dir)) : m.code_files_root()}
        blurb={
          loading || error
            ? undefined
            : plural(count, m.code_files_count_one, m.code_files_count)
        }
      >
        {loading ? (
          <ConsoleLoading py="xl" />
        ) : error ? (
          <Text size="sm" c="dimmed" mt="md">
            {m.code_files_failed()}
          </Text>
        ) : count === 0 ? (
          <Text size="sm" c="dimmed" mt="md">
            {m.code_files_empty_folder()}
          </Text>
        ) : shown.length === 0 ? (
          <Text size="sm" c="dimmed" mt="md">
            {m.code_files_no_match()}
          </Text>
        ) : (
          <Stack gap="xs" mt="md">
            {shown.map((entry) => {
              const kind = kindOf(entry.path, entry.type)
              const Icon = KIND_ICON[kind]
              const change = changes.byPath.get(entry.path)
              const open = () =>
                entry.type === 'directory'
                  ? onOpenDir(entry.path)
                  : onOpenFile(entry.path)
              return (
                <CardRow
                  key={entry.path}
                  testId={`code-entry-${entry.path}`}
                  onClick={open}
                  leading={
                    <StatusTile tone={kind === 'folder' ? 'info' : 'neutral'}>
                      <Icon size={18} />
                    </StatusTile>
                  }
                  title={asI18n(entry.name)}
                  badges={
                    change ? (
                      <StatusBadgeFor status={change.status} />
                    ) : entry.type === 'directory' &&
                      changes.dirs.has(entry.path) ? (
                      <StatusBadge tone="info" size="sm">
                        {m.code_status_modified()}
                      </StatusBadge>
                    ) : undefined
                  }
                  meta={KIND_LABEL[kind]()}
                  trailing={<Chevron name={entry.name} onOpen={open} />}
                />
              )
            })}
          </Stack>
        )}
      </SectionCard>

      <ForDevelopers testId="code-files-developers" hint={m.code_dev_hint()}>
        <DevFields>
          <DevField label={m.code_dev_folder()} value={dir || '.'} />
          <DevField label={m.code_dev_branch()} value={status?.branch ?? '—'} />
        </DevFields>
        {error ? <DevNote>{asI18n(errorText(error))}</DevNote> : null}
      </ForDevelopers>
    </>
  )
}

export const FileDetailCards: React.FC<{
  path: string
  file: WorkspaceFile | undefined
  loading: boolean
  error: unknown
  change: GitStatusEntry | undefined
  onSeeChanges: () => void
}> = ({ path, file, loading, error, change, onSeeChanges }) => {
  useLocale()
  const size = useSize()
  const kind = kindOf(path)
  const folder = parentOf(path)

  return (
    <>
      <SectionCard
        hero
        testId="code-file-hero"
        title={asI18n(baseName(path))}
        blurb={folder ? m.code_file_in({ folder }) : m.code_file_at_top()}
        right={
          change ? (
            <Button
              variant="light"
              leftSection={<FileDiff size={16} />}
              onClick={onSeeChanges}
            >
              {m.code_see_changes()}
            </Button>
          ) : undefined
        }
      >
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="lg" mt="lg">
          <Fact label={m.code_fact_kind()}>{KIND_LABEL[kind]()}</Fact>
          <Fact label={m.code_fact_size()}>
            {file ? asI18n(size(file.size)) : asI18n('—')}
          </Fact>
          <Fact label={m.code_fact_since_save()}>
            {change ? (
              <StatusBadgeFor status={change.status} />
            ) : (
              m.code_fact_unchanged()
            )}
          </Fact>
        </SimpleGrid>
      </SectionCard>

      <SectionCard
        testId="code-file-contents"
        title={m.code_file_contents()}
        blurb={m.code_file_contents_blurb()}
      >
        {loading ? (
          <ConsoleLoading py="xl" />
        ) : error || !file ? (
          <Text size="sm" c="dimmed" mt="md">
            {m.code_file_failed()}
          </Text>
        ) : file.binary ? (
          <Text size="sm" c="dimmed" mt="md">
            {m.code_file_binary()}
          </Text>
        ) : !file.content ? (
          <Text size="sm" c="dimmed" mt="md">
            {m.code_file_empty()}
          </Text>
        ) : (
          <>
            {file.truncated && (
              <Text size="sm" c="dimmed" mt="md">
                {m.code_file_truncated()}
              </Text>
            )}
            <CodeView
              code={file.content}
              language={LANGUAGE[extOf(path)] ?? 'plaintext'}
            />
          </>
        )}
      </SectionCard>

      <ForDevelopers testId="code-file-developers" hint={m.code_dev_hint()}>
        <DevFields>
          <DevField label={m.code_dev_path()} value={path} />
          {file && (
            <DevField
              label={m.code_fact_size()}
              value={String(m.code_dev_bytes({ count: file.size }))}
              copy={false}
            />
          )}
          {change && (
            <DevField
              label={m.code_dev_git_status()}
              value={`${change.index}${change.worktree}`}
              copy={false}
            />
          )}
        </DevFields>
        {error ? <DevNote>{asI18n(errorText(error))}</DevNote> : null}
      </ForDevelopers>
    </>
  )
}

type SyncResult =
  | { kind: 'pull'; result: GitPullResult }
  | { kind: 'push'; result: GitPushResult }
  | { kind: 'failed'; error: unknown }

const syncMessage = (
  sync: SyncResult
): { tone: StatusTone; text: I18nNode } => {
  if (sync.kind === 'failed')
    return { tone: 'bad', text: m.code_action_failed() }
  if (sync.kind === 'pull') {
    const { result } = sync
    if ('reason' in result) {
      if (result.reason === 'no-upstream')
        return { tone: 'neutral', text: m.code_pull_no_upstream() }
      if (result.reason === 'diverged')
        return { tone: 'warn', text: m.code_pull_diverged() }
      return { tone: 'warn', text: m.code_pull_local() }
    }
    return result.updated
      ? { tone: 'good', text: m.code_pull_updated() }
      : { tone: 'good', text: m.code_pull_none() }
  }
  const { result } = sync
  if (result.pushed) return { tone: 'good', text: m.code_push_done() }
  if (result.reason === 'detached')
    return { tone: 'warn', text: m.code_push_detached() }
  if (result.reason === 'no-remote')
    return { tone: 'neutral', text: m.code_push_no_remote() }
  return { tone: 'warn', text: m.code_push_behind() }
}

const syncDetail = (sync: SyncResult): string | undefined => {
  if (sync.kind === 'failed') return errorText(sync.error)
  return 'message' in sync.result ? sync.result.message : undefined
}

export type { SyncResult }

export const ChangesOverviewCards: React.FC<{
  status: GitStatus
  sync: SyncResult | undefined
  pulling: boolean
  pushing: boolean
  onPull: () => void
  onPush: () => void
  onOpenChange: (path: string) => void
}> = ({ status, sync, pulling, pushing, onPull, onPush, onOpenChange }) => {
  useLocale()
  const count = status.files.length
  const message = sync ? syncMessage(sync) : undefined
  const detail = sync ? syncDetail(sync) : undefined

  return (
    <>
      <SectionCard
        hero
        testId="code-changes-hero"
        title={
          status.clean ? m.code_changes_clean_title() : m.code_changes_title()
        }
        badges={
          status.clean ? undefined : (
            <StatusBadge tone="warn">{m.code_badge_unsaved()}</StatusBadge>
          )
        }
        blurb={
          status.clean
            ? m.code_changes_clean_blurb()
            : plural(count, m.code_changes_blurb_one, m.code_changes_blurb)
        }
      >
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="lg" mt="lg">
          <Fact label={m.code_fact_shared()}>
            {status.upstream
              ? m.code_fact_shared_yes()
              : m.code_fact_shared_no()}
          </Fact>
          <Fact label={m.code_fact_unsent()}>
            {asI18n(String(status.ahead))}
          </Fact>
          <Fact label={m.code_fact_waiting()}>
            {asI18n(String(status.behind))}
          </Fact>
        </SimpleGrid>
        <Group gap="sm" mt="lg" wrap="wrap">
          <Button
            variant="default"
            leftSection={<CloudDownload size={16} />}
            loading={pulling}
            disabled={pushing}
            onClick={onPull}
            data-testid="code-get-latest"
          >
            {m.code_get_latest()}
          </Button>
          <Button
            variant="default"
            leftSection={<CloudUpload size={16} />}
            loading={pushing}
            disabled={pulling || (!!status.upstream && status.ahead === 0)}
            onClick={onPush}
            data-testid="code-send"
          >
            {m.code_send()}
          </Button>
        </Group>
        {message && (
          <Alert
            mt="md"
            variant="light"
            color={STATUS_TONE_COLOR[message.tone]}
            data-testid="code-sync-result"
          >
            {message.text}
          </Alert>
        )}
      </SectionCard>

      {count > 0 && (
        <SectionCard
          testId="code-changes-list"
          title={m.code_changed_files()}
          blurb={m.code_changed_files_blurb()}
        >
          <Stack gap="xs" mt="md">
            {status.files.map((file) => {
              const Icon = STATUS_ICON[file.status]
              const folder = parentOf(file.path)
              const open = () => onOpenChange(file.path)
              return (
                <CardRow
                  key={file.path}
                  testId={`code-change-${file.path}`}
                  onClick={open}
                  leading={
                    <StatusTile tone={STATUS_TONE[file.status]}>
                      <Icon size={18} />
                    </StatusTile>
                  }
                  title={asI18n(baseName(file.path))}
                  badges={<StatusBadgeFor status={file.status} />}
                  meta={
                    file.from
                      ? m.code_renamed_from({ from: file.from })
                      : folder
                        ? m.code_file_in({ folder })
                        : m.code_file_at_top()
                  }
                  trailing={
                    <Chevron name={baseName(file.path)} onOpen={open} />
                  }
                />
              )
            })}
          </Stack>
        </SectionCard>
      )}

      <ForDevelopers testId="code-changes-developers" hint={m.code_dev_hint()}>
        <DevFields>
          <DevField label={m.code_dev_branch()} value={status.branch ?? '—'} />
          <DevField
            label={m.code_dev_upstream()}
            value={status.upstream ?? '—'}
          />
          <DevField
            label={m.code_dev_ahead_behind()}
            value={`${status.ahead} / ${status.behind}`}
            copy={false}
          />
        </DevFields>
        {detail ? <DevNote>{asI18n(detail)}</DevNote> : null}
        <DevCode
          label={m.code_dev_terminal()}
          code={'git status\ngit pull --ff-only\ngit push'}
        />
      </ForDevelopers>
    </>
  )
}

const hunks = (diff: string) => {
  const start = diff.search(/^@@/m)
  return start > 0 ? diff.slice(start) : diff
}

export const ChangeDetailCards: React.FC<{
  change: GitStatusEntry
  diff: GitDiff | undefined
  loading: boolean
  error: unknown
  onOpenFile: () => void
}> = ({ change, diff, loading, error, onOpenFile }) => {
  useLocale()
  const folder = parentOf(change.path)
  const blurb =
    change.status === 'untracked'
      ? m.code_change_blurb_new()
      : change.status === 'deleted'
        ? m.code_change_blurb_deleted()
        : m.code_change_blurb()

  return (
    <>
      <SectionCard
        hero
        testId="code-change-hero"
        title={asI18n(baseName(change.path))}
        badges={<StatusBadgeFor status={change.status} size="lg" />}
        subtitle={folder ? m.code_file_in({ folder }) : m.code_file_at_top()}
        blurb={blurb}
        right={
          change.status === 'deleted' ? undefined : (
            <Button
              variant="light"
              leftSection={<FileText size={16} />}
              onClick={onOpenFile}
            >
              {m.code_open_file()}
            </Button>
          )
        }
      />

      <SectionCard testId="code-change-diff" title={m.code_diff_title()}>
        {loading ? (
          <ConsoleLoading py="xl" />
        ) : error ? (
          <Text size="sm" c="dimmed" mt="md">
            {m.code_diff_failed()}
          </Text>
        ) : !diff?.diff.trim() ? (
          <Text size="sm" c="dimmed" mt="md">
            {m.code_diff_empty()}
          </Text>
        ) : (
          <>
            {diff.truncated && (
              <Text size="sm" c="dimmed" mt="md">
                {m.code_diff_truncated()}
              </Text>
            )}
            <CodeView code={hunks(diff.diff)} language="diff" />
          </>
        )}
      </SectionCard>

      <ForDevelopers testId="code-change-developers" hint={m.code_dev_hint()}>
        <DevFields>
          <DevField label={m.code_dev_path()} value={change.path} />
          <DevField
            label={m.code_dev_git_status()}
            value={`${change.index}${change.worktree}`}
            copy={false}
          />
        </DevFields>
        {error ? <DevNote>{asI18n(errorText(error))}</DevNote> : null}
        <DevCode
          label={m.code_dev_terminal()}
          code={`git diff -- ${change.path}`}
        />
      </ForDevelopers>
    </>
  )
}

export const HistoryCards: React.FC<{
  commits: GitCommit[] | undefined
  loading: boolean
  error: unknown
}> = ({ commits, loading, error }) => {
  const { locale } = useLocale()

  return (
    <>
      <SectionCard
        hero
        testId="code-history-hero"
        title={m.code_history_title()}
        blurb={m.code_history_blurb()}
      >
        {loading ? (
          <ConsoleLoading py="xl" />
        ) : error ? (
          <Text size="sm" c="dimmed" mt="md">
            {m.code_history_failed()}
          </Text>
        ) : !commits?.length ? (
          <Text size="sm" c="dimmed" mt="md">
            {m.code_history_empty()}
          </Text>
        ) : (
          <Stack gap="xs" mt="md">
            {commits.map((commit) => (
              <CardRow
                key={commit.sha}
                testId={`code-commit-${commit.shortSha}`}
                leading={
                  <StatusTile tone="neutral">
                    <GitCommitHorizontal size={18} />
                  </StatusTile>
                }
                title={asI18n(commit.subject)}
                meta={m.code_history_by({
                  author: commit.author,
                  ago: runAgo(commit.date, locale),
                })}
              />
            ))}
          </Stack>
        )}
      </SectionCard>

      <ForDevelopers testId="code-history-developers" hint={m.code_dev_hint()}>
        {commits?.length ? (
          <DevTable
            columns={[
              m.code_dev_commit(),
              m.code_dev_message(),
              m.code_dev_author(),
              m.code_dev_date(),
            ]}
            rows={commits.map((commit) => ({
              key: commit.sha,
              cells: [
                <Text key="sha" size="sm" ff="monospace">
                  {asI18n(commit.shortSha)}
                </Text>,
                <Text key="subject" size="sm">
                  {asI18n(commit.subject)}
                </Text>,
                <Text key="author" size="sm">
                  {asI18n(`${commit.author} <${commit.email}>`)}
                </Text>,
                <Text key="date" size="sm">
                  {asI18n(runWhen(commit.date, locale))}
                </Text>,
              ],
            }))}
          />
        ) : null}
        {error ? <DevNote>{asI18n(errorText(error))}</DevNote> : null}
        <DevCode label={m.code_dev_terminal()} code="git log --oneline -30" />
      </ForDevelopers>
    </>
  )
}
