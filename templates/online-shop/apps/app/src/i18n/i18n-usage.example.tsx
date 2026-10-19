import { Stack, Text } from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'
import { orderStatus } from '@/i18n/i18n-enum.gen'

// @snippet start i18n-messages-usage
export function AccountHeader({ shopName, role }: { shopName: string; role: string }) {
  return (
    <Stack>
      {/* A fixed message */}
      <Text>{m.preferences__language()}</Text>
      {/* A parameterized message */}
      <Text>{m.account__role({ role: asI18n(role) })}</Text>
      {/* A server-provided name has no message: brand it explicitly */}
      <Text>{asI18n(shopName)}</Text>
    </Stack>
  )
}
// @snippet end i18n-messages-usage

// @snippet start enum-label-lookup
// A status the database enum knows about: the generated map is exhaustive, so
// the label is a message accessor called at render time.
export function OrderStatusLabel({ status }: { status: keyof typeof orderStatus }) {
  return <Text>{orderStatus[status]()}</Text>
}

// An open server value (it may be newer than this build): guard before the
// lookup, and fall back to the raw value branded with asI18n.
export function OpenStatusLabel({ status }: { status: string }) {
  const label = status in orderStatus ? orderStatus[status as keyof typeof orderStatus]() : undefined
  return <Text>{label ?? asI18n(status)}</Text>
}
// @snippet end enum-label-lookup
