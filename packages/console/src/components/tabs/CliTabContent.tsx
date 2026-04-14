import React, { useState, useMemo, useCallback } from 'react'
import {
  Box,
  Center,
  Text,
  ScrollArea,
  UnstyledButton,
  Badge,
  CopyButton,
  ActionIcon,
  Tooltip,
} from '@mantine/core'
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react'
import type { CLIMeta } from '@pikku/core/cli'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { PanelProvider } from '../../context/PanelContext'
import { CliHelpText } from '../cli/CliHelpText'
import { SearchInput } from '../ui/SearchInput'
import classes from '../ui/console.module.css'

const countCommands = (commands: Record<string, any>): number => {
  let count = 0
  for (const cmd of Object.values(commands)) {
    if (cmd.pikkuFuncId) count++
    if (cmd.subcommands) count += countCommands(cmd.subcommands)
  }
  return count
}

const CliPageInner: React.FunctionComponent<{
  programs: any[]
  cliRenderers: Record<string, any>
}> = ({ programs, cliRenderers }) => {
  const [search, setSearch] = useState('')
  const [activeProgramId, setActiveProgramId] = useState<string>(
    programs[0]?.wireId || ''
  )
  const [commandPath, setCommandPath] = useState<string[]>([])
  const [expandedPrograms, setExpandedPrograms] = useState<Set<string>>(
    () => new Set(programs.length > 0 ? [programs[0].wireId] : [])
  )

  const activeProgram = useMemo(
    () => programs.find((p) => p.wireId === activeProgramId),
    [programs, activeProgramId]
  )

  const cliMeta = useMemo((): CLIMeta => {
    if (!activeProgram) return { programs: {}, renderers: {} }
    return {
      programs: {
        [activeProgramId]: {
          program: activeProgram.program || activeProgramId,
          commands: activeProgram.commands,
          options: activeProgram.options,
          defaultRenderName: activeProgram.defaultRenderName,
        },
      },
      renderers: cliRenderers,
    }
  }, [activeProgram, activeProgramId, cliRenderers])

  const toggleProgram = (wireId: string) => {
    setExpandedPrograms((prev) => {
      const next = new Set(prev)
      if (next.has(wireId)) next.delete(wireId)
      else next.add(wireId)
      return next
    })
  }

  const selectProgram = (wireId: string) => {
    setActiveProgramId(wireId)
    setCommandPath([])
    if (!expandedPrograms.has(wireId)) {
      setExpandedPrograms((prev) => new Set(prev).add(wireId))
    }
  }

  const selectCommand = (programId: string, cmdName: string) => {
    if (activeProgramId !== programId) {
      setActiveProgramId(programId)
      if (!expandedPrograms.has(programId)) {
        setExpandedPrograms((prev) => new Set(prev).add(programId))
      }
    }
    setCommandPath([cmdName])
  }

  const promptText = commandPath.length > 0
    ? `$ ${activeProgramId} ${commandPath.join(' ')} --help`
    : `$ ${activeProgramId} --help`

  const programCount = programs.length

  return (
    <Box className={classes.flexRow}>
      <Box className={classes.listPaneFixed} style={{ width: 280, minWidth: 220 }}>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search commands..."
          label="CLI"
          count={programCount}
        />
        <ScrollArea style={{ flex: 1 }}>
          {programs.map((prog) => {
            const isActive = prog.wireId === activeProgramId
            const isExpanded = expandedPrograms.has(prog.wireId)
            const commands = Object.entries(prog.commands || {})
            const q = search.toLowerCase()

            const filteredCommands = q
              ? commands.filter(
                  ([name, cmd]: [string, any]) =>
                    name.includes(q) ||
                    cmd.description?.toLowerCase().includes(q)
                )
              : commands

            if (q && filteredCommands.length === 0 && !prog.wireId.includes(q))
              return null

            return (
              <React.Fragment key={prog.wireId}>
                <UnstyledButton
                  onClick={() =>
                    isActive ? toggleProgram(prog.wireId) : selectProgram(prog.wireId)
                  }
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 12px',
                    fontSize: 11,
                    color: isActive
                      ? 'var(--app-meta-value)'
                      : 'var(--app-text)',
                    borderLeft: isActive
                      ? '2px solid rgba(6,182,212,0.4)'
                      : '2px solid transparent',
                    width: '100%',
                    opacity: isActive ? 1 : 0.6,
                    cursor: 'pointer',
                  }}
                >
                  {isExpanded ? (
                    <ChevronDown size={9} color="var(--app-section-label)" />
                  ) : (
                    <ChevronRight size={9} color="var(--app-section-label)" />
                  )}
                  <Text size="xs" ff="monospace" style={{ flex: 1 }}>
                    {prog.wireId}
                  </Text>
                  <Badge
                    size="xs"
                    variant="light"
                    color="cyan"
                    ff="monospace"
                  >
                    cli
                  </Badge>
                </UnstyledButton>

                {isExpanded &&
                  filteredCommands.map(([cmdName, cmd]: [string, any]) => {
                    const cmdActive =
                      isActive &&
                      commandPath.length === 1 &&
                      commandPath[0] === cmdName
                    return (
                      <UnstyledButton
                        key={cmdName}
                        onClick={() => selectCommand(prog.wireId, cmdName)}
                        className={classes.listItem}
                        data-active={cmdActive}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 7,
                          padding: '5px 12px 5px 24px',
                        }}
                      >
                        <Box className={classes.typeDot} style={{ background: 'rgba(124,58,237,0.4)' }} />
                        <Box style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            size="xs"
                            ff="monospace"
                            fw={cmdActive ? 600 : 400}
                            c={
                              cmdActive
                                ? 'var(--app-meta-value)'
                                : 'var(--app-text)'
                            }
                            truncate
                          >
                            {cmdName}
                          </Text>
                          {cmd.description && (
                            <Text
                              size="xs"
                              ff="monospace"
                              c={
                                cmdActive
                                  ? 'var(--app-meta-label)'
                                  : 'var(--app-text-muted)'
                              }
                              truncate
                              style={{ fontSize: 9 }}
                            >
                              {cmd.description}
                            </Text>
                          )}
                        </Box>
                      </UnstyledButton>
                    )
                  })}
              </React.Fragment>
            )
          })}
        </ScrollArea>
      </Box>

      <Box className={`${classes.detailPane} ${classes.flexColumn}`} style={{ overflow: 'hidden' }}>
        <Box className={classes.gridHeader} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Text size="xs" ff="monospace" c="var(--app-text-muted)" style={{ flex: 1 }}>
            <Text component="span" c="violet" ff="monospace">$</Text>{' '}
            <Text component="span" c="var(--app-text)" ff="monospace">
              {promptText.slice(2)}
            </Text>
          </Text>
          <CopyButton
            value={
              typeof document !== 'undefined'
                ? document.getElementById('cli-terminal')?.innerText || ''
                : ''
            }
          >
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'Copied' : 'Copy'}>
                <ActionIcon
                  variant="subtle"
                  color={copied ? 'teal' : 'gray'}
                  size="xs"
                  onClick={copy}
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        </Box>

        <Box
          id="cli-terminal"
          className={classes.overflowAuto}
          style={{
            flex: 1,
            padding: '20px 24px',
            lineHeight: 1.9,
            fontSize: 11,
            fontFamily: 'var(--mantine-font-family-monospace)',
          }}
        >
          {activeProgram ? (
            <CliHelpText
              programId={activeProgramId}
              cliMeta={cliMeta}
              commandPath={commandPath}
            />
          ) : (
            <Text c="dimmed" ff="monospace" size="sm">
              No CLI programs found.
            </Text>
          )}
        </Box>
      </Box>
    </Box>
  )
}

export const CliTabContent: React.FunctionComponent = () => {
  const { meta } = usePikkuMeta()
  const programs = meta.cliMeta || []

  if (programs.length === 0) {
    return (
      <Center h="100%">
        <Text c="dimmed">No CLI programs found.</Text>
      </Center>
    )
  }

  return (
    <PanelProvider>
      <CliPageInner
        programs={programs}
        cliRenderers={meta.cliRenderers || {}}
      />
    </PanelProvider>
  )
}
