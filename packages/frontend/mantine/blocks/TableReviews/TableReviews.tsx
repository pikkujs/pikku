import { Anchor, Group, Progress, Table, Text } from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'
import type { I18nString } from '@pikku/react'
import classes from './TableReviews.module.css'

// A row of the reviews table. Title/author are opaque data (not UI copy); year
// and review counts are numbers. A real app passes live rows via the `data` prop.
export interface TableReviewsRow {
  title: I18nString
  author: I18nString
  year: number
  reviews: { positive: number; negative: number }
}

const sampleData: TableReviewsRow[] = [
  {
    title: asI18n('Foundation'),
    author: asI18n('Isaac Asimov'),
    year: 1951,
    reviews: { positive: 2223, negative: 259 },
  },
  {
    title: asI18n('Frankenstein'),
    author: asI18n('Mary Shelley'),
    year: 1818,
    reviews: { positive: 5677, negative: 1265 },
  },
  {
    title: asI18n('Solaris'),
    author: asI18n('Stanislaw Lem'),
    year: 1961,
    reviews: { positive: 3487, negative: 1845 },
  },
  {
    title: asI18n('Dune'),
    author: asI18n('Frank Herbert'),
    year: 1965,
    reviews: { positive: 8576, negative: 663 },
  },
  {
    title: asI18n('The Left Hand of Darkness'),
    author: asI18n('Ursula K. Le Guin'),
    year: 1969,
    reviews: { positive: 6631, negative: 993 },
  },
  {
    title: asI18n('A Scanner Darkly'),
    author: asI18n('Philip K Dick'),
    year: 1977,
    reviews: { positive: 8124, negative: 1847 },
  },
]

interface TableReviewsProps {
  data?: TableReviewsRow[]
}

export function TableReviews({ data = sampleData }: TableReviewsProps) {
  const rows = data.map((row) => {
    const totalReviews = row.reviews.negative + row.reviews.positive
    const positiveReviews = (row.reviews.positive / totalReviews) * 100
    const negativeReviews = (row.reviews.negative / totalReviews) * 100

    return (
      <Table.Tr key={row.title}>
        <Table.Td>
          <Anchor component="button" fz="sm">
            {row.title}
          </Anchor>
        </Table.Td>
        <Table.Td>{row.year}</Table.Td>
        <Table.Td>
          <Anchor component="button" fz="sm">
            {row.author}
          </Anchor>
        </Table.Td>
        <Table.Td>{asI18n(Intl.NumberFormat().format(totalReviews))}</Table.Td>
        <Table.Td>
          <Group justify="space-between">
            <Text fz="xs" c="teal" fw={700}>
              {asI18n(`${positiveReviews.toFixed(0)}%`)}
            </Text>
            <Text fz="xs" c="red" fw={700}>
              {asI18n(`${negativeReviews.toFixed(0)}%`)}
            </Text>
          </Group>
          <Progress.Root>
            <Progress.Section
              className={classes.progressSection}
              value={positiveReviews}
              color="teal"
              aria-label={m.tablereviews__positive()}
            />
            <Progress.Section
              className={classes.progressSection}
              value={negativeReviews}
              color="red"
              aria-label={m.tablereviews__negative()}
            />
          </Progress.Root>
        </Table.Td>
      </Table.Tr>
    )
  })

  return (
    <Table.ScrollContainer minWidth={800}>
      <Table verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{m.tablereviews__book_title()}</Table.Th>
            <Table.Th>{m.tablereviews__year()}</Table.Th>
            <Table.Th>{m.tablereviews__author()}</Table.Th>
            <Table.Th>{m.tablereviews__reviews()}</Table.Th>
            <Table.Th>{m.tablereviews__reviews_distribution()}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>{rows}</Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}
