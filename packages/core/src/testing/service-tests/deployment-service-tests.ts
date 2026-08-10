import { describe, test, before, after } from 'node:test'

import type { DeploymentService } from '../../services/deployment-service.js'
import type { ServiceTestConfig } from '../service-tests.js'

/** Conformance suite for `deploymentService`. Runs only when a backend supplies one. */
export const defineDeploymentServiceTests = (
  name: string,
  deploymentService: NonNullable<
    ServiceTestConfig['services']['deploymentService']
  >
): void => {
  const factory = deploymentService
  describe(`DeploymentService [${name}]`, () => {
    let service: DeploymentService & { stop(): Promise<void> }

    before(async () => {
      service = await factory()
    })

    after(async () => {
      await service.stop()
    })

    test('start registers deployment', async () => {
      await service.start({
        deploymentId: 'deploy-1',
        endpoint: 'http://localhost:3000',
        functions: ['funcA', 'funcB'],
      })
    })
  })
}
