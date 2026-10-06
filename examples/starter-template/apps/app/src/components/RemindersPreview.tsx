import { usePikkuQueryStub } from '@project/functions-sdk/pikku/api.gen'

export function RemindersPreview() {
  const reminders = usePikkuQueryStub('reminders.list' as never, { featureFlag: 'reminders' })
  return <pre>{JSON.stringify(reminders.data, null, 2)}</pre>
}
