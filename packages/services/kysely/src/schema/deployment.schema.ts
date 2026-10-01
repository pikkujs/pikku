import { sql } from 'kysely'
import type { PikkuSchema } from './pikku-schema.types.js'

/** Registered deployments and the functions each one serves. */
export const deploymentSchema: PikkuSchema = {
  name: 'deployment',
  statements: [
    (db, _types, ctx) =>
      db.schema
        .createTable('pikkuDeployments')
        .addColumn('deploymentId', ctx.key, (col) => col.primaryKey())
        .addColumn('endpoint', ctx.text, (col) => col.notNull())
        .addColumn('lastHeartbeat', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        ),

    (db, _types, ctx) =>
      db.schema
        .createTable('pikkuDeploymentFunctions')
        .addColumn('deploymentId', ctx.key, (col) =>
          ctx.references(col.notNull(), 'pikkuDeployments.deploymentId')
        )
        .addColumn('functionName', ctx.key, (col) => col.notNull())
        .addPrimaryKeyConstraint('pikku_deployment_functions_pk', [
          'deploymentId',
          'functionName',
        ])
        .$call(
          ctx.foreignKeys('pikkuDeploymentFunctions', {
            deploymentId: 'pikkuDeployments.deploymentId',
          })
        ),

    (db, _types, ctx) =>
      db.schema
        .createIndex('idx_pikku_deployments_heartbeat')
        .on('pikkuDeployments')
        .column('lastHeartbeat'),

    (db, _types, ctx) =>
      db.schema
        .createIndex('idx_pikku_deployment_functions_name')
        .on('pikkuDeploymentFunctions')
        .column('functionName'),
  ],
}
