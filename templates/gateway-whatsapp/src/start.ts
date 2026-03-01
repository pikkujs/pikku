import { LocalGatewayService } from '@pikku/core/services'
import { stopSingletonServices } from '@pikku/core'
import {
  createConfig,
  createSingletonServices,
} from '../../functions/src/services.js'
import '../../functions/.pikku/pikku-bootstrap.gen.js'
import './wirings/gateway.wiring.js'

async function main(): Promise<void> {
  try {
    const config = await createConfig()
    const singletonServices = await createSingletonServices(config)
    singletonServices.logger.info('Starting WhatsApp Baileys gateway...')

    const gatewayService = new LocalGatewayService()
    await gatewayService.start()

    const shutdown = async (signal: string) => {
      singletonServices.logger.info(
        `Received ${signal}, shutting down gracefully...`
      )
      await gatewayService.stop()
      await stopSingletonServices()
      process.exit(0)
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))
  } catch (e: any) {
    console.error(e.toString())
    process.exit(1)
  }
}

main()
