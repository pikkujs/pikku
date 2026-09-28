import React, { useMemo, useState } from 'react'
import { ActionIcon, Box, Stack, Text } from '@pikku/mantine/core'
import { asI18n, type I18nNode } from '@pikku/react'
import { ChevronDown, ChevronRight, Terminal } from 'lucide-react'
import { generateCommandHelp } from '@pikku/core/cli'
import type { CLIMeta } from '@pikku/core/cli'
import { m } from '@/i18n/messages'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
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

const CommandRow: React.FC<{
  program: CliProgram
  entry: CommandEntry
  help: string
}> = ({ program, entry, help }) => {
  const [open, setOpen] = useState(false)
  const { meta } = usePikkuMeta()
  const name = program.program || program.wireId
  const usage = usageLine(name, entry)
  const positionals = entry.command.positionals ?? []
  const options = Object.entries(entry.command.options ?? {})
  const text = commandText(entry.command)
  const funcMeta = meta.functions?.find(
    (f: any) => f.pikkuFuncId === entry.command.pikkuFuncId
  )
  const inputs = positionals.length + options.length

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
      onClick={() => setOpen((value) => !value)}
      leading={
        <StatusTile tone="info">
          <Terminal size={18} />
        </StatusTile>
      }
      title={text ? asI18n(text) : asI18n(entry.path.join(' '))}
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
          aria-label={open ? m.wires_cli_row_hide() : m.wires_cli_row_show()}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </ActionIcon>
      }
    >
      {open && (
        <Box
          mt="md"
          pl={{ base: 0, sm: 52 }}
          onClick={(event) => event.stopPropagation()}
          style={{ cursor: 'default' }}
        >
          <Stack gap="md">
            <DevCode code={usage} label={m.wires_cli_how_to_run()} />
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
                <DevField
                  label={m.dev_function()}
                  value={entry.command.pikkuFuncId}
                />
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
                code={help}
                language="text"
                label={m.wires_cli_dev_help({
                  command: `${name} ${entry.path.join(' ')} --help`,
                })}
              />
            </ForDevelopers>
          </Stack>
        </Box>
      )}
    </CardRow>
  )
}

const ProgramCard: React.FC<{
  program: CliProgram
  entries: CommandEntry[]
  total: number
  cliRenderers: Record<string, any>
}> = ({ program, entries, total, cliRenderers }) => {
  const name = program.program || program.wireId
  const cliMeta = useMemo(
    (): CLIMeta =>
      ({
        programs: {
          [program.wireId]: {
            program: name,
            commands: program.commands,
            options: program.options,
            defaultRenderName: program.defaultRenderName,
          },
        },
        renderers: cliRenderers,
      }) as CLIMeta,
    [program, name, cliRenderers]
  )
  const helpFor = (path: string[]) => {
    try {
      return generateCommandHelp(program.wireId, cliMeta, path)
    } catch {
      return ''
    }
  }

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
            help={helpFor(entry.path)}
          />
        ))}
        <ForDevelopers testId={`cli-program-dev-${program.wireId}`}>
          <DevFields>
            <DevField label={m.dev_id()} value={program.wireId} />
          </DevFields>
          <DevCode
            code={helpFor([])}
            language="text"
            label={m.wires_cli_dev_help({ command: `${name} --help` })}
          />
        </ForDevelopers>
      </Stack>
    </SectionCard>
  )
}

export const CliProgramCards: React.FC<{
  programs: CliProgram[]
  cliRenderers: Record<string, any>
  searchQuery: string
}> = ({ programs, cliRenderers, searchQuery }) => {
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
        />
      ))}
    </>
  )
}
