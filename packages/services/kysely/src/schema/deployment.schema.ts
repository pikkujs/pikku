import { sql } from 'kysely'
import type { PikkuSchema } from './pikku-schema.types.js'

/** Registered deployments and the functions each one serves. */
export const deploymentSchema: PikkuSchema = {
  name: 'deployment',
  statements: [
    (db) =>
      db.schema
        .createTable('pikkuDeployments')
        .addColumn('deploymentId', 'text', (col) => col.primaryKey())
        .addColumn('endpoint', 'text', (col) => col.notNull())
        .addColumn('lastHeartbeat', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        ),

    (db) =>
      db.schema
        .createTable('pikkuDeploymentFunctions')
        .addColumn('deploymentId', 'text', (col) =>
          col
            .notNull()
            .references('pikkuDeployments.deploymentId')
            .onDelete('cascade')
        )
        .addColumn('functionName', 'text', (col) => col.notNull())
        .addPrimaryKeyConstraint('pikku_deployment_functions_pk', [
          'deploymentId',
          'functionName',
        ]),

    (db) =>
      db.schema
        .createIndex('idx_pikku_deployments_heartbeat')
        .on('pikkuDeployments')
        .column('lastHeartbeat'),

    (db) =>
      db.schema
        .createIndex('idx_pikku_deployment_functions_name')
        .on('pikkuDeploymentFunctions')
        .column('functionName'),
  ],
}
