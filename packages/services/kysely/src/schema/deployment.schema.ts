import type { PikkuSchema } from './pikku-schema.types.js'

/** Registered deployments and the functions each one serves. */
export const deploymentSchema: PikkuSchema = {
  name: 'deployment',
  tables: {
    pikkuDeployments: {
      columns: {
        deploymentId: { type: 'key', primaryKey: true },
        endpoint: { type: 'text', required: true },
        lastHeartbeat: {
          type: 'timestamp',
          required: true,
          default: { now: true },
        },
        createdAt: {
          type: 'timestamp',
          required: true,
          default: { now: true },
        },
      },
      indexes: [
        { name: 'idx_pikku_deployments_heartbeat', columns: ['lastHeartbeat'] },
      ],
    },
    pikkuDeploymentFunctions: {
      columns: {
        deploymentId: {
          type: 'key',
          required: true,
          references: 'pikkuDeployments.deploymentId',
          onDelete: 'cascade',
        },
        functionName: { type: 'key', required: true },
      },
      primaryKey: ['deploymentId', 'functionName'],
      indexes: [
        {
          name: 'idx_pikku_deployment_functions_name',
          columns: ['functionName'],
        },
      ],
    },
  },
}
