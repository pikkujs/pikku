import React, { useState, useMemo } from 'react'
import { Box, Stack, TextInput, NavLink, Text, ScrollArea } from '@mantine/core'
import { Search } from 'lucide-react'

interface CommandMeta {
  pikkuFuncId?: string
  description?: string
  subcommands?: Record<string, CommandMeta>
}

interface ProgramMeta {
  wireId: string
  description?: string
  commands: Record<string, CommandMeta>
}

interface TreeCommand {
  name: string
  path: string[]
  description?: string
  hasChildren: boolean
  children: TreeCommand[]
  pikkuFuncId?: string
}

const buildTree = (
  commands: Record<string, CommandMeta>,
  parentPath: string[]
): TreeCommand[] => {
  return Object.entries(commands).map(([name, cmd]) => {
    const path = [...parentPath, name]
    const children = cmd.subcommands ? buildTree(cmd.subcommands, path) : []
    return {
      name,
      path,
      description: cmd.description,
      hasChildren: children.length > 0,
      children,
      pikkuFuncId: cmd.pikkuFuncId || undefined,
    }
  })
}

const matchesSearch = (cmd: TreeCommand, query: string): boolean => {
  if (cmd.name.toLowerCase().includes(query)) return true
  if (cmd.description?.toLowerCase().includes(query)) return true
  return cmd.children.some((c) => matchesSearch(c, query))
}

const filterTree = (commands: TreeCommand[], query: string): TreeCommand[] => {
  if (!query) return commands
  return commands
    .filter((cmd) => matchesSearch(cmd, query))
    .map((cmd) => ({
      ...cmd,
      children: filterTree(cmd.children, query),
    }))
}

interface CommandNodeProps {
  command: TreeCommand
  activePath: string[]
  onSelect: (path: string[]) => void
  depth: number
}

const CommandNode: React.FunctionComponent<CommandNodeProps> = ({
  command,
  activePath,
  onSelect,
  depth,
}) => {
  const isActive =
    command.path.length === activePath.length &&
    command.path.every((p, i) => p === activePath[i])

  const isParentOfActive =
    command.path.length < activePath.length &&
    command.path.every((p, i) => p === activePath[i])

  return (
    <NavLink
      label={
        <Text size="sm" fw={isActive ? 600 : 400} truncate>
          {command.name}
        </Text>
      }
      description={command.description}
      active={isActive}
      opened={isParentOfActive || undefined}
      onClick={() => onSelect(command.path)}
      styles={{
        root: { borderRadius: 4 },
        description: { fontSize: 'var(--mantine-font-size-xs)' },
      }}
    >
      {command.hasChildren
        ? command.children.map((child) => (
            <CommandNode
              key={child.name}
              command={child}
              activePath={activePath}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))
        : undefined}
    </NavLink>
  )
}

interface CliCommandTreeProps {
  program: ProgramMeta
  activePath: string[]
  onSelect: (path: string[]) => void
}

export const CliCommandTree: React.FunctionComponent<CliCommandTreeProps> = ({
  program,
  activePath,
  onSelect,
}) => {
  const [search, setSearch] = useState('')

  const tree = useMemo(
    () => buildTree(program.commands, []),
    [program.commands]
  )

  const filtered = useMemo(
    () => filterTree(tree, search.toLowerCase()),
    [tree, search]
  )

  return (
    <Stack gap={0} style={{ height: '100%' }}>
      <Box
        px="sm"
        py="xs"
        style={{
          borderBottom: '1px solid var(--mantine-color-default-border)',
        }}
      >
        <TextInput
          placeholder="Search commands..."
          leftSection={<Search size={14} />}
          size="xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Box>
      <ScrollArea style={{ flex: 1 }} px="xs" py="xs">
        {filtered.map((cmd) => (
          <CommandNode
            key={cmd.name}
            command={cmd}
            activePath={activePath}
            onSelect={onSelect}
            depth={0}
          />
        ))}
        {search && filtered.length === 0 && (
          <Text size="sm" c="dimmed" ta="center" py="md">
            No commands match &ldquo;{search}&rdquo;
          </Text>
        )}
      </ScrollArea>
    </Stack>
  )
}
