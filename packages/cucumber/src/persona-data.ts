/**
 * Type-safe named-data map for Cucumber step definitions.
 *
 * Instead of inlining JSON or tables in feature files, define all test inputs
 * in a data file and reference entries by persona name in steps.
 *
 * Usage:
 *
 *   // tests/tests/support/data.ts
 *   import { PersonaData } from '@pikku/cucumber'
 *
 *   export const loginInputs = new PersonaData({
 *     yasser: { email: 'yasser@example.com', password: 'hunter2' },
 *     guest:  { email: 'guest@example.com',  password: 'guest' },
 *   })
 *
 *   // tests/tests/support/steps.ts
 *   import { loginInputs } from './data.js'
 *
 *   Given('{string} logs in', async function (name: string) {
 *     await this.call(name, 'auth:login', loginInputs.get(name))
 *   })
 *
 *   // tests/tests/features/auth.feature
 *   Given 'yasser' logs in
 */
export class PersonaData<T> {
  constructor(private readonly map: Record<string, T>) {}

  get(name: string): T {
    if (!(name in this.map)) {
      const known = Object.keys(this.map).join(', ')
      throw new Error(
        `No data for persona "${name}". Known personas: ${known}`
      )
    }
    return this.map[name]!
  }

  has(name: string): boolean {
    return name in this.map
  }

  keys(): string[] {
    return Object.keys(this.map)
  }
}
