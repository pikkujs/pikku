import { join, dirname } from 'node:path'

/**
 * Where the generated `SCENARIO_ACTOR_SECRET` declaration lives — beside the
 * personas file, like `auth-secrets.gen.ts` sits beside the auth scaffold.
 *
 * Shared with the inspector's scaffold-file list: nothing imports this file, so
 * it is unreachable through the import graph and has to be inspected explicitly.
 */
export const personasSecretsFilePath = (personasFile: string) =>
  join(dirname(personasFile), 'pikku-personas-secrets.gen.ts')
