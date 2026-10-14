import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { pikkuSessionlessFunc } from '#pikku/function'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeVirtualUsersTypes } from './serialize-virtual-users-types.js'
import { serializeVirtualUsersSecrets } from './serialize-virtual-users-secrets.js'
import { virtualUsersSecretsFilePath } from './virtual-users-secrets-file.js'
import {
  virtualUserEnvironmentErrors,
  validateAndBuildVirtualUsersMeta,
} from '@pikku/core/virtual-user'

export const pikkuVirtualUsers = pikkuSessionlessFunc<
  { bootstrap?: boolean },
  void
>({
  func: async ({ logger, config, getInspectorState }, data) => {
    const { virtualUsersFile, virtualUsersMetaJsonFile, rolesFile, packageMappings } =
      config

    if (!virtualUsersFile) {
      return
    }

    // Same cold-start reasoning as Scopes and Roles: on a bare .pikku this
    // runs before the app's own types exist, so it takes the zero state. The
    // file only has to exist so a virtual user file can import defineVirtualUsers.
    const bootstrap = data?.bootstrap ?? false
    const state = await getInspectorState(false, bootstrap, bootstrap)

    const environments = config.environments ?? {}

    // Before anything is written. A virtual user that may not run where it says it
    // runs is a declaration to fix, not a file to generate — and generating
    // it anyway would leave a `.pikku` that typechecks while lying.
    const errors = state.virtualUsers.definitions.flatMap((virtualUser) =>
      virtualUserEnvironmentErrors(virtualUser.id, virtualUser, environments)
    )
    if (errors.length) {
      throw new Error(errors.join('\n'))
    }

    const content = serializeVirtualUsersTypes({
      definitions: state.virtualUsers.definitions,
      rolesImportPath: getFileImportRelativePath(
        virtualUsersFile,
        rolesFile,
        packageMappings
      ),
      environmentNames: Object.keys(environments),
    })
    await writeFileInDir(logger, virtualUsersFile, content)

    // The actor sign-in secret only means anything once someone is declared
    // to sign in. Drop the file again when the last virtual user goes, so a stale
    // declaration can't keep asking a deploy for a value nothing reads.
    const secretsFile = virtualUsersSecretsFilePath(virtualUsersFile)
    if (state.virtualUsers.definitions.length > 0) {
      await writeFileInDir(logger, secretsFile, serializeVirtualUsersSecrets())
    } else if (existsSync(secretsFile)) {
      await rm(secretsFile)
    }

    if (virtualUsersMetaJsonFile) {
      const meta = validateAndBuildVirtualUsersMeta(state.virtualUsers.definitions)
      await writeFileInDir(
        logger,
        virtualUsersMetaJsonFile,
        JSON.stringify(meta, null, 2)
      )
    }
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating PikkuVirtualUsers types',
      commandEnd: 'Created PikkuVirtualUsers types',
    }),
  ],
})
