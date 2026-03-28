import type { CloudflareClient } from './client.js'
import type { CronTrigger } from './types.js'

/**
 * Set cron triggers on a Worker.
 *
 * This replaces all existing cron triggers on the Worker with the provided
 * set. To remove all triggers, pass an empty array.
 *
 * @param client     - Authenticated CloudflareClient instance.
 * @param workerName - The Worker script name.
 * @param triggers   - Array of cron schedule expressions to set.
 */
export async function setCronTriggers(
  client: CloudflareClient,
  workerName: string,
  triggers: CronTrigger[]
): Promise<CronTrigger[]> {
  const result = await client.request<{ schedules: CronTrigger[] }>(
    'PUT',
    `/workers/scripts/${encodeURIComponent(workerName)}/schedules`,
    triggers.map((t) => ({ cron: t.cron }))
  )
  return result.schedules
}

/**
 * Get all cron triggers currently set on a Worker.
 *
 * @param client     - Authenticated CloudflareClient instance.
 * @param workerName - The Worker script name.
 * @returns Array of cron trigger objects.
 */
export async function getCronTriggers(
  client: CloudflareClient,
  workerName: string
): Promise<CronTrigger[]> {
  const result = await client.request<{ schedules: CronTrigger[] }>(
    'GET',
    `/workers/scripts/${encodeURIComponent(workerName)}/schedules`
  )
  return result.schedules
}
