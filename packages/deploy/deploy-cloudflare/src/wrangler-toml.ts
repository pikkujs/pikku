/**
 * Generates a wrangler.toml for a single deployment unit.
 *
 * Used for:
 * - Local dev/testing: `wrangler dev --local -c .deploy/build/<unit>/wrangler.toml`
 * - Eject: `pikku deploy eject` outputs these as standalone deployable units
 *
 * Fabric's own deploy pipeline uses the CF API directly for speed,
 * but these files ensure every unit is also deployable via wrangler.
 */

type DeploymentHandler =
  | {
      type: 'fetch'
      routes: Array<{ method: string; route: string; pikkuFuncId: string }>
    }
  | { type: 'queue'; queueName: string }
  | { type: 'scheduled'; schedule: string; taskName: string }

interface DeploymentUnit {
  name: string
  role: string
  services: Array<{ capability: string; sourceServiceName: string }>
  dependsOn: string[]
  handlers: DeploymentHandler[]
}

interface DeploymentManifest {
  projectId: string
  units: DeploymentUnit[]
  queues: Array<{ name: string; consumerUnit: string }>
  scheduledTasks: Array<{ name: string; schedule: string; unitName: string }>
  secrets: Array<{ secretId: string }>
  variables: Array<{ variableId: string }>
}

const COMPAT_DATE = '2024-12-18'
const COMPAT_FLAGS = ['nodejs_compat_v2']

export function generateWranglerToml(
  unit: DeploymentUnit,
  manifest: DeploymentManifest,
  projectId: string
): string {
  const lines: string[] = []
  const workerName = `${projectId}-${unit.name}`

  // Header
  lines.push(`#:schema node_modules/wrangler/config-schema.json`)
  lines.push(`name = "${workerName}"`)
  lines.push(`main = "bundle.js"`)
  lines.push(`compatibility_date = "${COMPAT_DATE}"`)
  lines.push(
    `compatibility_flags = [${COMPAT_FLAGS.map((f) => `"${f}"`).join(', ')}]`
  )
  lines.push('')
  lines.push('[observability]')
  lines.push('enabled = true')

  // Service capability bindings
  const capabilities = new Set(unit.services.map((s) => s.capability))

  if (capabilities.has('database')) {
    lines.push('')
    lines.push('[[d1_databases]]')
    lines.push(`binding = "DB"`)
    lines.push(`database_name = "${projectId}-db"`)
    lines.push(`database_id = "pikku"`)
  }

  if (capabilities.has('workflow-state')) {
    lines.push('')
    lines.push('[[d1_databases]]')
    lines.push(`binding = "WORKFLOW_DB"`)
    lines.push(`database_name = "${projectId}-workflow-db"`)
    lines.push(`database_id = "pikku"`)
  }

  if (capabilities.has('object-storage')) {
    lines.push('')
    lines.push('[[r2_buckets]]')
    lines.push(`binding = "STORAGE"`)
    lines.push(`bucket_name = "${projectId}-storage"`)
  }

  if (capabilities.has('ai-model') || capabilities.has('ai-storage')) {
    // AI services share the main DB for storage
    if (!capabilities.has('database')) {
      lines.push('')
      lines.push('[[d1_databases]]')
      lines.push(`binding = "DB"`)
      lines.push(`database_name = "${projectId}-db"`)
      lines.push(`database_id = "pikku"`)
    }
  }

  if (capabilities.has('kv')) {
    lines.push('')
    lines.push('[[kv_namespaces]]')
    lines.push(`binding = "KV"`)
    lines.push(`id = "" # Set after creation`)
  }

  if (capabilities.has('ai-model')) {
    lines.push('')
    lines.push('[ai]')
    lines.push(`binding = "AI"`)
  }

  // Queue producer bindings — any unit that needs 'queue' capability
  if (capabilities.has('queue')) {
    for (const queue of manifest.queues) {
      lines.push('')
      lines.push('[[queues.producers]]')
      lines.push(`binding = "${toScreamingSnake(queue.name)}"`)
      lines.push(`queue = "${projectId}-${queue.name}"`)
    }
  }

  // Handler-driven sections (replaces role-specific config)
  addHandlerConfig(lines, unit, projectId)

  // Service bindings for gateway units that depend on other workers
  if (unit.dependsOn.length > 0) {
    for (const dep of unit.dependsOn) {
      lines.push('')
      lines.push('[[services]]')
      lines.push(`binding = "${toScreamingSnake(dep)}"`)
      lines.push(`service = "${projectId}-${dep}"`)
    }
  }

  // Secrets as vars placeholder
  const secrets = manifest.secrets
  if (secrets.length > 0) {
    lines.push('')
    lines.push('[vars]')
    for (const secret of secrets) {
      lines.push(`# ${secret.secretId} = "" # Set via wrangler secret put`)
    }
  }

  lines.push('')
  return lines.join('\n')
}

/**
 * Adds wrangler config sections driven by the unit's handlers array.
 *
 * - scheduled handler → [triggers] crons
 * - queue handler → [[queues.consumers]]
 * - channel role → durable object bindings
 */
function addHandlerConfig(
  lines: string[],
  unit: DeploymentUnit,
  projectId: string
): void {
  // Collect cron schedules from scheduled handlers
  const schedules: string[] = []
  for (const handler of unit.handlers) {
    if (handler.type === 'scheduled') {
      schedules.push(handler.schedule)
    }
  }
  if (schedules.length > 0) {
    lines.push('')
    lines.push('[triggers]')
    lines.push(`crons = [${schedules.map((s) => `"${s}"`).join(', ')}]`)
  }

  // Queue consumer bindings from queue handlers
  for (const handler of unit.handlers) {
    if (handler.type === 'queue') {
      lines.push('')
      lines.push('[[queues.consumers]]')
      lines.push(`queue = "${projectId}-${handler.queueName}"`)
      lines.push(`max_batch_size = 10`)
      lines.push(`max_batch_timeout = 5`)
    }
  }

  // Channel gateway needs durable object bindings
  if (unit.role === 'channel') {
    lines.push('')
    lines.push('[[durable_objects.bindings]]')
    lines.push(`name = "WEBSOCKET_HIBERNATION_SERVER"`)
    lines.push(`class_name = "WebSocketHibernationServer"`)
    lines.push('')
    lines.push('[[migrations]]')
    lines.push(`tag = "v1"`)
    lines.push(`new_classes = ["WebSocketHibernationServer"]`)
  }
}

function toScreamingSnake(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toUpperCase()
}
