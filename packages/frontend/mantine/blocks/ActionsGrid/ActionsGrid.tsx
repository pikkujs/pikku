import {
  Landmark,
  Banknote,
  Coins,
  CreditCard,
  Receipt,
  Undo2,
  ReceiptText,
  Repeat,
  FileText,
} from 'lucide-react'
import {
  Anchor,
  Card,
  Group,
  SimpleGrid,
  Text,
  UnstyledButton,
  useMantineTheme,
} from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import classes from './ActionsGrid.module.css'

const mockdata = [
  { title: m.actionsgrid__credit_cards, icon: CreditCard, color: 'violet' },
  { title: m.actionsgrid__banks_nearby, icon: Landmark, color: 'indigo' },
  { title: m.actionsgrid__transfers, icon: Repeat, color: 'blue' },
  { title: m.actionsgrid__refunds, icon: Undo2, color: 'green' },
  { title: m.actionsgrid__receipts, icon: Receipt, color: 'teal' },
  { title: m.actionsgrid__taxes, icon: ReceiptText, color: 'cyan' },
  { title: m.actionsgrid__reports, icon: FileText, color: 'pink' },
  { title: m.actionsgrid__payments, icon: Coins, color: 'red' },
  { title: m.actionsgrid__cashback, icon: Banknote, color: 'orange' },
]

export function ActionsGrid() {
  const theme = useMantineTheme()

  const items = mockdata.map((item) => (
    <UnstyledButton key={item.title()} className={classes.item}>
      <item.icon color={theme.colors[item.color][6]} size={32} strokeWidth={1.5} />
      <Text size="xs" mt={7}>
        {item.title()}
      </Text>
    </UnstyledButton>
  ))

  return (
    <Card withBorder radius="md" className={classes.card}>
      <Group justify="space-between">
        <Text className={classes.title}>{m.actionsgrid__title()}</Text>
        <Anchor c="inherit" size="xs">
          {m.actionsgrid__more_services()}
        </Anchor>
      </Group>
      <SimpleGrid cols={3} mt="md">
        {items}
      </SimpleGrid>
    </Card>
  )
}
