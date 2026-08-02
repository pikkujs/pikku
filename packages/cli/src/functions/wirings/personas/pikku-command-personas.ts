import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializePersonasTypes } from './serialize-personas-types.js'
import {
  personaEnvironmentErrors,
  validateAndBuildPersonasMeta,
} from '@pikku/core/persona'

export const pikkuPersonas = pikkuSessionlessFunc<{ bootstrap?: boolean }, void>(
  {
    func: async ({ logger, config, getInspectorState }, data) => {
      const { personasFile, personasMetaJsonFile, rolesFile, packageMappings } =
        config

      if (!personasFile) {
        return
      }

      // Same cold-start reasoning as Scopes and Roles: on a bare .pikku this
      // runs before the app's own types exist, so it takes the zero state. The
      // file only has to exist so a persona file can import definePersonas.
      const bootstrap = data?.bootstrap ?? false
      const state = await getInspectorState(false, bootstrap, bootstrap)

      const environments = config.environments ?? {}

      // Before anything is written. A persona that may not run where it says it
      // runs is a declaration to fix, not a file to generate — and generating
      // it anyway would leave a `.pikku` that typechecks while lying.
      const errors = state.personas.definitions.flatMap((persona) =>
        personaEnvironmentErrors(persona.id, persona, environments)
      )
      if (errors.length) {
        throw new Error(errors.join('\n'))
      }

      const content = serializePersonasTypes({
        definitions: state.personas.definitions,
        rolesImportPath: getFileImportRelativePath(
          personasFile,
          rolesFile,
          packageMappings
        ),
        environmentNames: Object.keys(environments),
      })
      await writeFileInDir(logger, personasFile, content)

      if (personasMetaJsonFile) {
        const meta = validateAndBuildPersonasMeta(state.personas.definitions)
        await writeFileInDir(
          logger,
          personasMetaJsonFile,
          JSON.stringify(meta, null, 2)
        )
      }
    },
    middleware: [
      logCommandInfoAndTime({
        commandStart: 'Creating PikkuPersonas types',
        commandEnd: 'Created PikkuPersonas types',
      }),
    ],
  }
)
