import type { PlatformServiceContributor } from '@pikku/deploy'

const SERVICE_MODULE = new URL('./service.ts', import.meta.url).href

const contributor: PlatformServiceContributor = {
  name: 'host-mail',
  imports: [
    `import { HostMailService } from ${JSON.stringify(SERVICE_MODULE)}`,
  ],
  emit: () => [
    `  if (env.HOST_MAIL_URL && env.HOST_MAIL_TOKEN) {`,
    `    services.emailService = new HostMailService({`,
    `      url: env.HOST_MAIL_URL,`,
    `      token: env.HOST_MAIL_TOKEN,`,
    `      onError: (error) => console.warn(error instanceof Error ? error.message : String(error)),`,
    `    })`,
    `  }`,
  ],
}

export default contributor
