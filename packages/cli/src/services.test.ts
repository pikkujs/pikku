import { strict as assert } from 'node:assert'
import { describe, test } from 'node:test'
import { CONFIG_FREE_COMMANDS } from './services.js'
import { fabricCommands } from './fabric/fabric-commands.js'

describe('CONFIG_FREE_COMMANDS', () => {
  test('every fabric changes subcommand runs outside a pikku project', () => {
    const subcommands = Object.keys(
      (fabricCommands as Record<string, any>).changes.subcommands
    )

    assert.ok(subcommands.length > 0, 'fabric changes has no subcommands')
    for (const name of subcommands) {
      assert.ok(
        CONFIG_FREE_COMMANDS.has(`fabric.changes.${name}`),
        `fabric.changes.${name} is missing from CONFIG_FREE_COMMANDS, so it dies on a missing pikku.config.json before it can read the queue`
      )
    }
    assert.ok(CONFIG_FREE_COMMANDS.has('fabric.changes'))
  })

  test('fabric login runs before there is a project to be inside', () => {
    assert.ok(CONFIG_FREE_COMMANDS.has('fabric.login'))
  })
})
