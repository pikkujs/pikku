import { pikkuSessionlessFunc } from '#pikku/function'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'path'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { mcpSurfaceSlug } from '../../../utils/mcp-surface.js'
import { serializeMCPJson } from '@pikku/inspector'

export const pikkuMCPJSON = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const state = await getInspectorState()
    const mcpJsonFile = config.mcpJsonFile ?? config.clientFiles?.mcpJsonFile

    if (!mcpJsonFile) {
      return
    }

    await writeFileInDir(logger, mcpJsonFile, serializeMCPJson(logger, state), {
      ignoreModifyComment: true,
    })

    // A project serving several MCP endpoints gets one manifest per endpoint,
    // named after its surface, beside the default one. `deploy-apply` finds
    // each by the slug in its unit's name, so the slug has to be built the
    // same way here as it is in the analyzer.
    const mcpDir = dirname(mcpJsonFile)
    const surfaces = state.mcpEndpoints.surfaces ?? {}
    const written = new Set<string>()
    for (const surface of Object.keys(surfaces)) {
      const name = `mcp.${mcpSurfaceSlug(surface)}.gen.json`
      written.add(name)
      await writeFileInDir(
        logger,
        join(mcpDir, name),
        serializeMCPJson(logger, state, surface),
        { ignoreModifyComment: true }
      )
    }

    // A surface that has gone away leaves its manifest behind, and `pikku dev`
    // mounts every manifest it finds — so without this, dropping `mcpEndpoint`
    // keeps serving the endpoint it was supposed to remove, with whatever tool
    // list it had on the last run that still wrote it.
    if (existsSync(mcpDir)) {
      for (const name of readdirSync(mcpDir)) {
        if (!/^mcp\..+\.gen\.json$/.test(name) || written.has(name)) continue
        logger.debug(
          `Removing manifest for a surface that no longer exists: ${name}`
        )
        rmSync(join(mcpDir, name))
      }
    }
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating MCP JSON',
      commandEnd: 'Generated MCP JSON',
    }),
  ],
})
