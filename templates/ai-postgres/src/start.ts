import { PikkuExpressServer } from '@pikku/express'
import { LocalSecretService } from '@pikku/core/services'
import { PgAIStorageService } from '@pikku/pg'
import { VercelAIAgentRunner } from '@pikku/ai-vercel'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import postgres from 'postgres'
import {
  createConfig,
  createSingletonServices,
  createWireServices,
} from '../../functions/src/services.js'
import '../../functions/.pikku/pikku-bootstrap.gen.js'

async function main(): Promise<void> {
  try {
    const config = await createConfig()

    const sql = postgres(
      process.env.DATABASE_URL ||
        'postgres://postgres:password@localhost:5432/pikku_ai'
    )
    const pgAiStorage = new PgAIStorageService(sql)
    await pgAiStorage.init()

    const secrets = new LocalSecretService()

    const providers: Record<string, any> = {
      ollama: createOpenAI({
        baseURL: 'http://localhost:11434/v1',
        apiKey: 'ollama',
      }),
    }

    if (await secrets.hasSecret('OPENAI_API_KEY')) {
      providers.openai = createOpenAI({
        apiKey: await secrets.getSecret('OPENAI_API_KEY'),
      })
    }
    if (await secrets.hasSecret('ANTHROPIC_API_KEY')) {
      providers.anthropic = createAnthropic({
        apiKey: await secrets.getSecret('ANTHROPIC_API_KEY'),
      })
    }

    const singletonServices = await createSingletonServices(config, {
      aiStorage: pgAiStorage,
      aiRunState: pgAiStorage,
      aiAgentRunner: new VercelAIAgentRunner(providers),
    })

    const appServer = new PikkuExpressServer(
      { ...config, port: 4002, hostname: 'localhost' },
      singletonServices,
      createWireServices
    )
    appServer.enableExitOnSigInt()
    await appServer.init()
    await appServer.start()

    process.on('SIGTERM', async () => {
      singletonServices.logger.info('Shutting down...')
      await pgAiStorage.close()
      await sql.end()
      process.exit(0)
    })
  } catch (e: any) {
    console.error(e.toString())
    process.exit(1)
  }
}

main()
