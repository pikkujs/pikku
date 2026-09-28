import type * as ts from 'typescript'
import {
  incomingWebhookRoute,
  type IncomingWebhooksMeta,
} from '@pikku/core/webhook'
import type {
  InspectorLogger,
  InspectorOptions,
  InspectorState,
} from '../types.js'
import { registerHTTPRouteMeta } from '../add/add-http-route.js'

/**
 * Merges the app's incoming webhooks with every wired addon instance's, scoped
 * by instance name with secrets resolved through its overrides, then mounts a
 * route for each in the generated wiring file.
 */
export const finalizeIncomingWebhooks = (
  logger: InspectorLogger,
  state: InspectorState,
  options: InspectorOptions
): void => {
  const meta: IncomingWebhooksMeta = {}
  const addons = state.rpc.wireAddonDeclarations

  for (const webhook of state.incomingWebhooks ?? []) {
    if (webhook.route && options.isAddon) {
      logger.error(
        `Incoming webhook '${webhook.id}' in ${webhook.file} sets 'route', which an addon cannot: its route is always /webhooks/<instance>/${webhook.id}.`
      )
    }
    if (addons.has(webhook.id)) {
      logger.error(
        `Incoming webhook '${webhook.id}' in ${webhook.file} has the same name as a wired addon instance, whose webhooks are mounted under /webhooks/${webhook.id}/. Rename one of them.`
      )
      continue
    }
    meta[webhook.id] = {
      id: webhook.id,
      localId: webhook.id,
      pikkuFuncId: webhook.pikkuFuncId,
      route:
        (!options.isAddon && webhook.route) || incomingWebhookRoute(webhook.id),
      ...(webhook.title !== undefined ? { title: webhook.title } : {}),
      events: webhook.events,
      ...(webhook.secret !== undefined ? { secret: webhook.secret } : {}),
      needs: Object.fromEntries(webhook.needs.map((name) => [name, name])),
      exportedName: webhook.variable,
      sourceFile: webhook.file,
    }
  }

  for (const [namespace, published] of Object.entries(
    state.addonIncomingWebhooks ?? {}
  )) {
    const decl = addons.get(namespace)
    if (!decl) continue
    const resolve = (name: string) => decl.secretOverrides?.[name] ?? name
    for (const entry of Object.values(published)) {
      const id = `${namespace}:${entry.localId}`
      meta[id] = {
        ...entry,
        id,
        instance: namespace,
        package: decl.package,
        pikkuFuncId: `${namespace}:${entry.pikkuFuncId}`,
        route: incomingWebhookRoute(entry.localId, namespace),
        ...(entry.secret ? { secret: resolve(entry.secret) } : {}),
        needs: Object.fromEntries(
          Object.keys(entry.needs).map((name) => [name, resolve(name)])
        ),
        sourceFile: undefined,
      }
    }
  }

  state.incomingWebhooksMeta = meta
  const wiringFile = options.incomingWebhooksWiringFile
  if (options.isAddon || !wiringFile) return

  const sourceFile = { fileName: wiringFile } as ts.SourceFile
  for (const entry of Object.values(meta)) {
    if (state.http.meta.post[entry.route]) {
      logger.error(
        `Incoming webhook '${entry.id}' is mounted at POST ${entry.route}, which a wireHTTP already uses.`
      )
      continue
    }
    registerHTTPRouteMeta({
      route: {
        method: 'post',
        route: entry.route,
        func: {
          pikkuFuncId: entry.pikkuFuncId,
          ...(entry.package ? { packageName: entry.package } : {}),
        },
        auth: false,
      },
      state,
      logger,
      sourceFile,
    })
  }
}
