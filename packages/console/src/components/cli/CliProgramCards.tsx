import React, { useMemo } from 'react'
import { ActionIcon, Stack, Text } from '@pikku/mantine/core'
import { asI18n, type I18nNode } from '@pikku/react'
import { ChevronRight, Terminal } from 'lucide-react'
import { generateCommandHelp } from '@pikku/core/cli'
import type { CLIMeta } from '@pikku/core/cli'
import { m } from '@/i18n/messages'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { usePanelContext } from '../../context/PanelContext'
import { usePanelUrl } from '../../hooks/usePanelUrl'
import { SectionCard } from '../ui/SectionCard'
import { CardRow } from '../ui/CardRow'
import { StatusTile } from '../ui/StatusTile'
import { StatusBadge } from '../ui/StatusBadge'
import { ForDevelopers } from '../ui/ForDevelopers'
import {
  DevCode,
  DevField,
  DevFields,
  devSourcePath,
} from '../ui/DevDetail'

type CliOption = {
  description?: string
  short?: string
  type?: string
  default?: unknown
  choices?: unknown[]
  required?: boolean
}

type CliCommand = {
  pikkuFuncId?: string
  description?: string
  summary?: string
  positionals?: { name: string; required?: boolean; variadic?: boolean }[]
  options?: Record<string, CliOption>
  subcommands?: Record<string, CliCommand>
}

type CliProgram = {
  wireId: string
  program?: string
  commands?: Record<string, CliCommand>
  options?: Record<string, CliOption>
  defaultRenderName?: string
  auth?: boolean
}

type CommandEntry = { path: string[]; command: CliCommand }

const flatten = (
  commands: Record<string, CliCommand> | undefined,
  parent: string[] = []
): CommandEntry[] =>
  Object.entries(commands ?? {}).flatMap(([name, command]) => {
    const path = [...parent, name]
    const own = command.pikkuFuncId ? [{ path, command }] : []
    return [...own, ...flatten(command.subcommands, path)]
  })

const usageLine = (program: string, entry: CommandEntry) => {
  const parts = [program, ...entry.path]
  for (const positional of entry.command.positionals ?? []) {
    const name = positional.variadic ? `${positional.name}...` : positional.name
    parts.push(positional.required ? `<${name}>` : `[${name}]`)
  }
  for (const [name, option] of Object.entries(entry.command.options ?? {})) {
    const flag =
      option.type === 'boolean' ? `--${name}` : `--${name} <${name}>`
    parts.push(option.required ? flag : `[${flag}]`)
  }
  return parts.join(' ')
}

const commandText = (command: CliCommand) =>
  command.description || command.summary

const helpFor = (
  program: CliProgram,
  cliRenderers: Record<string, any>,
  path: string[]
) => {
  const cliMeta = {
    programs: {
      [program.wireId]: {
        program: program.program || program.wireId,
        commands: program.commands,
        options: program.options,
        defaultRenderName: program.defaultRenderName,
      },
    },
    renderers: cliRenderers,
  } as CLIMeta
  try {
    return generateCommandHelp(program.wireId, cliMeta, path)
  } catch {
    return ''
  }
}

const panelIdOf = (program: CliProgram, entry: CommandEntry) =>
  `${program.wireId}::${entry.path.join(' ')}`

const titleOf = (entry: CommandEntry) =>
  commandText(entry.command) || entry.path.join(' ')

export const CliCommandDetail: React.FC<{
  programId: string
  path: string[]
}> = ({ programId, path }) => {
  const { meta } = usePikkuMeta()
  const program = (meta.cliMeta as CliProgram[] | undefined)?.find(
    (entry) => entry.wireId === programId
  )
  const entry = program
    ? flatten(program.commands).find(
        (candidate) => candidate.path.join(' ') === path.join(' ')
      )
    : undefined
  if (!program || !entry) return null

  const name = program.program || program.wireId
  const positionals = entry.command.positionals ?? []
  const options = Object.entries(entry.command.options ?? {})
  const funcMeta = meta.functions?.find(
    (f: any) => f.pikkuFuncId === entry.command.pikkuFuncId
  )
  const inputs = positionals.length + options.length

  return (
    <Stack gap="md" data-testid={`cli-detail-${entry.path.join('-')}`}>
      <DevCode code={usageLine(name, entry)} label={m.wires_cli_how_to_run()} />
      {inputs > 0 && (
        <Stack gap={6}>
          <Text size="sm" c="dimmed">
            {m.wires_cli_inputs_title()}
          </Text>
          {positionals.map((positional) => (
            <Text size="sm" key={positional.name}>
              <Text span fw={600}>
                {asI18n(positional.name)}
              </Text>
              {asI18n(' — ')}
              {positional.required
                ? m.wires_cli_input_required()
                : m.wires_cli_input_optional()}
            </Text>
          ))}
          {options.map(([optionName, option]) => (
            <Text size="sm" key={optionName}>
              <Text span fw={600} ff="monospace">
                {asI18n(`--${optionName}`)}
              </Text>
              {asI18n(' — ')}
              {option.description
                ? asI18n(option.description)
                : option.required
                  ? m.wires_cli_input_required()
                  : m.wires_cli_input_optional()}
            </Text>
          ))}
        </Stack>
      )}
      <ForDevelopers testId={`cli-command-dev-${entry.path.join('-')}`}>
        <DevFields>
          <DevField label={m.dev_function()} value={entry.command.pikkuFuncId} />
          <DevField
            label={m.wires_cli_dev_command()}
            value={entry.path.join(' ')}
          />
          {funcMeta?.sourceFile && (
            <DevField
              label={m.dev_source()}
              value={devSourcePath(funcMeta.sourceFile)}
            />
          )}
        </DevFields>
        <DevCode
          code={helpFor(program, meta.cliRenderers || {}, entry.path)}
          language="text"
          label={m.wires_cli_dev_help({
            command: `${name} ${entry.path.join(' ')} --help`,
          })}
        />
      </ForDevelopers>
    </Stack>
  )
}

const CommandRow: React.FC<{
  program: CliProgram
  entry: CommandEntry
  selected: boolean
  onOpen: () => void
}> = ({ program, entry, selected, onOpen }) => {
  const name = program.program || program.wireId
  const inputs =
    (entry.command.positionals ?? []).length +
    Object.keys(entry.command.options ?? {}).length

  const metaLine: I18nNode[] = [
    m.wires_cli_row_run({ command: `${name} ${entry.path.join(' ')}` }),
    inputs === 0
      ? m.wires_cli_row_no_inputs()
      : inputs === 1
        ? m.wires_cli_row_inputs_one()
        : m.wires_cli_row_inputs({ count: inputs }),
  ]

  return (
    <CardRow
      testId={`cli-command-${entry.path.join('-')}`}
      onClick={onOpen}
      selected={selected}
      leading={
        <StatusTile tone="info">
          <Terminal size={18} />
        </StatusTile>
      }
      title={asI18n(titleOf(entry))}
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
          aria-label={m.wires_cli_row_show()}
          onClick={onOpen}
        >
          <ChevronRight size={16} />
        </ActionIcon>
      }
    />
  )
}

const ProgramCard: React.FC<{
  program: CliProgram
  entries: CommandEntry[]
  total: number
  cliRenderers: Record<string, any>
  activePanel: string | null
  onOpen: (program: CliProgram, entry: CommandEntry) => void
}> = ({ program, entries, total, cliRenderers, activePanel, onOpen }) => {
  const name = program.program || program.wireId

  return (
    <SectionCard
      testId={`cli-program-${program.wireId}`}
      eyebrow={
        <Text size="sm" c="dimmed" mb={4}>
          {m.wires_cli_eyebrow()}
        </Text>
      }
      title={asI18n(name)}
      subtitle={
        total === 1
          ? m.wires_cli_count_one()
          : m.wires_cli_count({ count: total })
      }
      badges={
        program.auth ? (
          <StatusBadge tone="warn" size="sm">
            {m.wires_cli_needs_signin()}
          </StatusBadge>
        ) : undefined
      }
      blurb={m.wires_cli_blurb({ program: name })}
      footer={
        <ForDevelopers testId={`cli-program-dev-${program.wireId}`} attached>
          <DevFields>
            <DevField label={m.dev_id()} value={program.wireId} />
          </DevFields>
          <DevCode
            code={helpFor(program, cliRenderers, [])}
            language="text"
            label={m.wires_cli_dev_help({ command: `${name} --help` })}
          />
        </ForDevelopers>
      }
    >
      <Stack gap="xs" mt="md">
        {entries.length === 0 && (
          <Text size="sm" c="dimmed">
            {m.wires_cli_no_commands()}
          </Text>
        )}
        {entries.map((entry) => (
          <CommandRow
            key={entry.path.join(' ')}
            program={program}
            entry={entry}
            selected={activePanel === `cli-${panelIdOf(program, entry)}`}
            onOpen={() => onOpen(program, entry)}
          />
        ))}
      </Stack>
    </SectionCard>
  )
}

export const CliProgramCards: React.FC<{
  programs: CliProgram[]
  cliRenderers: Record<string, any>
  searchQuery: string
}> = ({ programs, cliRenderers, searchQuery }) => {
  const { openPanel, activePanel } = usePanelContext()
  const rows = useMemo(
    () =>
      programs.flatMap((program) =>
        flatten(program.commands).map((entry) => ({ program, entry }))
      ),
    [programs]
  )
  const open = (program: CliProgram, entry: CommandEntry) =>
    openPanel('cli', panelIdOf(program, entry), titleOf(entry), {
      command: { programId: program.wireId, path: entry.path },
    })

  usePanelUrl({
    type: 'cli',
    items: rows,
    getId: ({ program, entry }) => panelIdOf(program, entry),
    open: (_id, { program, entry }) => open(program, entry),
  })

  const query = searchQuery.trim().toLowerCase()
  const shown = programs
    .map((program) => {
      const all = flatten(program.commands)
      const entries = query
        ? all.filter(
            (entry) =>
              entry.path.join(' ').toLowerCase().includes(query) ||
              commandText(entry.command)?.toLowerCase().includes(query)
          )
        : all
      return { program, all, entries }
    })
    .filter(({ entries }) => !query || entries.length > 0)

  if (shown.length === 0) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="xl">
        {m.cli_search_no_match({ query: searchQuery })}
      </Text>
    )
  }

  return (
    <>
      {shown.map(({ program, all, entries }) => (
        <ProgramCard
          key={program.wireId}
          program={program}
          entries={entries}
          total={all.length}
          cliRenderers={cliRenderers}
          activePanel={activePanel}
          onOpen={open}
        />
      ))}
    </>
  )
}
