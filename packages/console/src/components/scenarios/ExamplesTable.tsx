import React, { useMemo } from 'react'
import { Box, Table, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'

const cell = (value: unknown): string =>
  typeof value === 'string' ? value : JSON.stringify(value)

type ExamplesTableProps = {
  /** One row per feature entry that supplied `data` for the same scenario. */
  rows: unknown[]
}

export const ExamplesTable: React.FC<ExamplesTableProps> = ({ rows }) => {
  const columns = useMemo(() => {
    const keys = new Set<string>()
    for (const row of rows) {
      if (row && typeof row === 'object' && !Array.isArray(row)) {
        for (const key of Object.keys(row)) keys.add(key)
      }
    }
    return [...keys]
  }, [rows])

  if (rows.length === 0) return null

  return (
    <Box data-testid="scenario-examples">
      <Text size="xs" fw={600} c="dimmed" mb={6}>
        {m.scenarios_examples()}
      </Text>
      <Box style={{ overflowX: 'auto' }}>
        <Table withTableBorder withColumnBorders fz="xs">
          <Table.Thead>
            <Table.Tr>
              {columns.map((column) => (
                <Table.Th key={column}>{asI18n(column)}</Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((row, index) => (
              <Table.Tr key={index}>
                {columns.map((column) => (
                  <Table.Td key={column} ff="monospace">
                    {asI18n(cell((row as Record<string, unknown>)?.[column]))}
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Box>
    </Box>
  )
}
