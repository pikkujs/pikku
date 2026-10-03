import {
  Badge,
  Button,
  Card,
  Group,
  List,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@pikku/mantine/core'
import { Check } from 'lucide-react'
import type { I18nString } from '@pikku/react'
import { m } from '@/i18n/messages'

export type PricingPlan = {
  id: string
  name: I18nString
  /** preformatted price string, e.g. "$29" */
  price: I18nString
  /** e.g. "/month" */
  period?: I18nString
  features: I18nString[]
  highlighted?: boolean
}

// A responsive pricing grid. Presentational — the page supplies the plans and an
// onSelectPlan handler that starts checkout (wire it to the Better Auth Stripe
// client — see the usage note in `pikku blocks show PricingTable`).
// currentPlanId marks the plan the user is already on.
export function PricingTable({
  plans,
  currentPlanId,
  onSelectPlan,
}: {
  plans: PricingPlan[]
  currentPlanId?: string
  onSelectPlan: (planId: string) => void
}) {
  return (
    <SimpleGrid cols={{ base: 1, sm: plans.length > 2 ? 3 : 2 }} spacing="lg">
      {plans.map((plan) => {
        const current = plan.id === currentPlanId
        return (
          <Card
            key={plan.id}
            withBorder
            radius="md"
            padding="xl"
            style={
              plan.highlighted
                ? { borderColor: 'var(--mantine-primary-color-filled)', borderWidth: 2 }
                : undefined
            }
          >
            <Stack gap="md" h="100%">
              <Group justify="space-between" align="center">
                <Text fw={600} size="lg">
                  {plan.name}
                </Text>
                {plan.highlighted && <Badge variant="filled">{m.pricingtable__popular()}</Badge>}
              </Group>
              <Group gap={4} align="baseline">
                <Title order={2}>{plan.price}</Title>
                {plan.period && (
                  <Text c="dimmed" size="sm">
                    {plan.period}
                  </Text>
                )}
              </Group>
              <List
                spacing="sm"
                size="sm"
                center
                icon={
                  <ThemeIcon color="var(--mantine-primary-color-light)" size={20} radius="xl">
                    <Check size={12} />
                  </ThemeIcon>
                }
                style={{ flex: 1 }}
              >
                {plan.features.map((feature, i) => (
                  <List.Item key={i}>{feature}</List.Item>
                ))}
              </List>
              <Button
                fullWidth
                mt="auto"
                variant={plan.highlighted ? 'filled' : 'default'}
                disabled={current}
                onClick={() => onSelectPlan(plan.id)}
              >
                {current ? m.pricingtable__current() : m.pricingtable__choose()}
              </Button>
            </Stack>
          </Card>
        )
      })}
    </SimpleGrid>
  )
}
