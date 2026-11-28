/**
 * Bundled with `bun build` and run with no `.pikku` directory on disk and no
 * `metaService`, the way a Cloudflare Worker or a standalone binary runs. The
 * bootstrap is the backend's, written by the same deploy-codegen pass a deploy
 * unit's is.
 */
import '../.pikku/backends/api/pikku-bootstrap.gen.js'
import { fetch } from '@pikku/core/http'
import {
  assertAnalyticsSinksDeclared,
  createAnalyticsSinks,
} from '@pikku/core/analytics'
import { ConsoleLogger } from '@pikku/core/services'
import { createConfig, createSingletonServices, delivered } from './services.js'

const logger = new ConsoleLogger()
logger.setLevel(5)
const analyticsSinks = createAnalyticsSinks()
await createSingletonServices(await createConfig(), {
  logger,
  analyticsSinks,
} as never)
assertAnalyticsSinksDeclared(analyticsSinks)

const response = await fetch(
  new Request('http://localhost/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ amount: 42 }),
  })
)
process.stdout.write(
  JSON.stringify({
    status: response.status,
    delivered: delivered.map((record) => record.name),
  })
)
