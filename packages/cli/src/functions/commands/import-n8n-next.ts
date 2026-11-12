/**
 * What `pikku import n8n` adds around the importer's files, so the next steps are not a hunt:
 *  - the start wiring (the importer drops the trigger node): an HTTP route or a schedule that starts the workflow,
 *  - the addon packages the workflow needs, and which of them have no published addon.
 */

type Raw = { name?: string; nodes?: Array<Record<string, any>> }

export type Trigger =
  | { kind: 'webhook'; path: string; method: string }
  | { kind: 'schedule'; cron: string }
  | { kind: 'manual' }

const short = (type: string): string =>
  String(type ?? '')
    .split('.')
    .pop()!
    .toLowerCase()

const isTrigger = (type: string): boolean => {
  const s = short(type)
  return (
    s.includes('trigger') || s === 'webhook' || s === 'cron' || s === 'interval'
  )
}

/** An n8n schedule rule in cron form, or undefined when it is not a plain one. */
export const cronOf = (node: Record<string, any>): string | undefined => {
  const p = node.parameters ?? {}
  const rule = p.rule?.interval?.[0]
  if (rule) {
    if (
      rule.field === 'cronExpression' &&
      typeof rule.expression === 'string' &&
      !rule.expression.startsWith('=')
    )
      return rule.expression.trim()
    const hour = Number(rule.triggerAtHour ?? 0)
    const minute = Number(rule.triggerAtMinute ?? 0)
    if (rule.field === 'minutes' && rule.minutesInterval)
      return `*/${Number(rule.minutesInterval)} * * * *`
    if (rule.field === 'hours' && rule.hoursInterval)
      return `${minute} */${Number(rule.hoursInterval)} * * *`
    if (rule.field === 'days' && rule.daysInterval)
      return `${minute} ${hour} */${Number(rule.daysInterval)} * *`
    if (
      rule.field === 'weeks' &&
      Array.isArray(rule.triggerAtDay) &&
      rule.triggerAtDay.length
    )
      return `${minute} ${hour} * * ${rule.triggerAtDay.join(',')}`
    return undefined
  }
  const item = p.triggerTimes?.item?.[0]
  if (item?.mode === 'everyHour') return `${Number(item.minute ?? 0)} * * * *`
  if (item?.mode === 'everyDay')
    return `${Number(item.minute ?? 0)} ${Number(item.hour ?? 0)} * * *`
  if (item?.mode === 'everyX' && item.unit === 'minutes')
    return `*/${Number(item.value)} * * * *`
  if (item?.mode === 'everyX' && item.unit === 'hours')
    return `0 */${Number(item.value)} * * *`
  return undefined
}

export const triggerOf = (raw: Raw): Trigger => {
  for (const node of raw.nodes ?? []) {
    if (node.disabled || !isTrigger(node.type)) continue
    const s = short(node.type)
    if (s === 'webhook') {
      const path = String(node.parameters?.path ?? '').replace(/^\/+|\/+$/g, '')
      const method = String(node.parameters?.httpMethod ?? 'GET').toLowerCase()
      return {
        kind: 'webhook',
        path,
        method: ['get', 'post', 'put', 'patch', 'delete'].includes(method)
          ? method
          : 'post',
      }
    }
    if (s === 'scheduletrigger' || s === 'cron' || s === 'interval') {
      const cron = cronOf(node)
      if (cron) return { kind: 'schedule', cron }
    }
  }
  return { kind: 'manual' }
}

const pascal = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
const kebab = (s: string): string =>
  s
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()

/** `<slug>.start.ts`: starts the workflow by its literal name from an HTTP route or a schedule. */
export const startFile = (
  workflowName: string,
  slug: string,
  trigger: Trigger
): { code: string; wiring: string } => {
  const fn = `start${pascal(slug)}`
  const name = JSON.stringify(workflowName)
  if (trigger.kind === 'schedule') {
    return {
      wiring: `schedule ${trigger.cron}`,
      code: `import { pikkuVoidFunc } from '#pikku/function'
import { wireScheduler } from '#pikku/scheduler'

export const ${fn} = pikkuVoidFunc({
  func: async (_services, _input, { rpc }) => {
    await rpc.startWorkflow(${name}, {})
  },
})

wireScheduler({ name: ${JSON.stringify(slug)}, schedule: ${JSON.stringify(trigger.cron)}, func: ${fn} })
`,
    }
  }
  const method = trigger.kind === 'webhook' ? trigger.method : 'post'
  const route = `/${(trigger.kind === 'webhook' && trigger.path) || kebab(slug)}`
  return {
    wiring: `http ${method} ${route}`,
    code: `import { pikkuSessionlessFunc } from '#pikku/function'
import { wireHTTP } from '#pikku/http'

export const ${fn} = pikkuSessionlessFunc({
  func: async (_services, data: any, { rpc }) => {
    return await rpc.startWorkflow(${name}, data)
  },
})

wireHTTP({ method: ${JSON.stringify(method)}, route: ${JSON.stringify(route)}, auth: false, func: ${fn} })
`,
  }
}

/** Namespaces of the addon functions the graph calls (`gmail:messageSend` -> gmail), `graph` included. */
export const namespacesUsed = (files: Record<string, string>): Set<string> => {
  const out = new Set<string>()
  for (const [path, text] of Object.entries(files)) {
    if (!path.endsWith('.graph.ts')) continue
    for (const m of text.matchAll(/["']([a-z][a-z0-9-]*):[A-Za-z0-9_]+["']/g))
      out.add(m[1])
  }
  return out
}

/** The `@pikku/addon-<x>` packages the generated addons file wires, by instance. */
export const wiredPackages = (
  addonsFile: string | undefined
): Array<{ name: string; pkg: string }> => {
  if (!addonsFile) return []
  return [
    ...addonsFile.matchAll(
      /wireAddon\(\{[^}]*?name:\s*"([^"]+)",\s*package:\s*"([^"]+)"/gs
    ),
  ].map((m) => ({ name: m[1], pkg: m[2] }))
}

/** The addons file without the instances of unpublished packages (all gone: undefined). */
export const dropUnpublished = (
  addonsFile: string,
  unpublished: Set<string>
): string | undefined => {
  const blocks = addonsFile.split(/(?=wireAddon\(\{)/)
  const head = blocks.shift() ?? ''
  const kept = blocks.filter((b) => {
    const pkg = b.match(/package:\s*"([^"]+)"/)?.[1]
    return !(pkg && unpublished.has(pkg))
  })
  return kept.length ? head + kept.join('') : undefined
}
