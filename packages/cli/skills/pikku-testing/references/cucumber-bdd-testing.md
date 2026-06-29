# Cucumber / BDD Testing with `@pikku/cucumber`

## Personas and Named Data — Never Inline JSON

**Never put JSON, inline tables, or raw values inside `.feature` files.** Feature files are for human-readable scenarios; all test data belongs in typed maps that step definitions look up by name.

`@pikku/cucumber` exports `PersonaData<T>` — a typed map that throws a clear error when a name is missing.

### Personas

A **persona** is a named user: login credentials plus the session held after authenticating. Define all personas in one file:

```ts
// tests/tests/support/personas.ts
import { PersonaData } from '@pikku/cucumber'

export const logins = new PersonaData({
  yasser: { email: 'yasser@example.com', password: 'hunter2' },
  guest:  { email: 'guest@example.com',  password: 'guest123' },
})
```

A persona step logs in and stores the session in the world so every subsequent call by that persona carries it automatically:

```ts
// tests/tests/support/steps/auth.steps.ts
import { Given } from '@cucumber/cucumber'
import { logins } from '../personas.js'

Given('{string} logs in', async function (name: string) {
  await this.call(name, 'auth:login', logins.get(name))
  const { token } = this.lastResult as { token: string }
  this.setSession(name, { token })
})
```

### Named Domain Data

Use a separate `PersonaData` map per domain concept. Name entries after real-world meaning, not technical fields:

```ts
// tests/tests/support/data/cards.ts
import { PersonaData } from '@pikku/cucumber'

export const cards = new PersonaData({
  'writing a blog post': { title: 'Writing a blog post', columnId: 'backlog' },
  'fix the login bug':   { title: 'Fix the login bug',   columnId: 'in-progress' },
})
```

Steps resolve the name and make the call — the feature file never sees raw data:

```ts
// tests/tests/support/steps/card.steps.ts
import { When, Then } from '@cucumber/cucumber'
import assert from 'node:assert/strict'
import { cards } from '../data/cards.js'

When('{string} creates a card for {string}', async function (persona: string, cardName: string) {
  await this.call(persona, 'kanban:createCard', cards.get(cardName))
})

When('{string} gets the card {string}', async function (persona: string, cardName: string) {
  const { title } = cards.get(cardName)
  await this.call(persona, 'kanban:getCard', { title })
})

// "the newly created card" — checks the live result against the data map entry
// AND any server-assigned fields (id, createdAt) are present
Then('the result is the newly created card {string}', function (cardName: string) {
  const expected = cards.get(cardName)
  const result = this.lastResult as typeof expected & { id: string; createdAt: string }
  assert.equal(result.title, expected.title)
  assert.equal(result.columnId, expected.columnId)
  assert.ok(result.id, 'expected server-assigned id')
  assert.ok(result.createdAt, 'expected server-assigned createdAt')
})
```

The feature file reads naturally:

```gherkin
Feature: Card management

  Scenario: Create and retrieve a card
    Given 'yasser' logs in
    When 'yasser' creates a card for 'writing a blog post'
    And 'yasser' gets the card 'writing a blog post'
    Then the result is the newly created card 'writing a blog post'
```

### File layout

```
tests/tests/support/
  personas.ts          ← logins PersonaData (one per project)
  data/
    cards.ts           ← cards PersonaData
    users.ts           ← users PersonaData
  steps/
    auth.steps.ts      ← login / logout steps
    card.steps.ts      ← card CRUD steps
```

Keep one `PersonaData` instance per domain concept. Steps import only what they need — no cross-domain coupling.

## Anti-Patterns

### Inline data in feature files

Raw values/JSON in `.feature` files make scenarios brittle and unreadable. Use named references resolved by step definitions instead.

```gherkin
# Wrong
When I call 'kanban:createCard' with {"title": "My card", "columnId": "backlog"}
Then the result title is "My card"

# Right
When 'yasser' creates a card for 'writing a blog post'
Then the result is the newly created card 'writing a blog post'
```

### Feature-coupled step definitions

Steps tied to one feature can't be reused and cause duplication. Organise by **domain concept**, not by feature. Name step files after the domain they cover — a login step belongs in `auth.steps.ts` regardless of which feature needs it.

```
Wrong:                          Right:
steps/                          steps/
  edit_work_experience.ts         auth.steps.ts
  edit_languages.ts               profile.steps.ts
  edit_education.ts               card.steps.ts
```

### Conjunction steps

Don't combine multiple actions into a single step — it makes reuse impossible. Use `And` / `But`: each step does exactly one thing.

```gherkin
# Wrong — two actions in one step
Given 'yasser' is logged in and has created a card

# Right — atomic, composable
Given 'yasser' logs in
And 'yasser' creates a card for 'writing a blog post'
```

### Asserting in When steps

`When` steps perform actions; `Then` steps assert outcomes. Mixing them hides intent.

```gherkin
# Wrong
When 'yasser' creates a card and the title is 'writing a blog post'

# Right
When 'yasser' creates a card for 'writing a blog post'
Then the call succeeds
```

### Hard-coding persona data in step definitions

Credentials/test inputs embedded in step code can't be reused and break when data changes — look them up from `PersonaData`.

```ts
// Wrong
Given('{string} logs in', async function (name: string) {
  await this.call(name, 'auth:login', { email: 'yasser@example.com', password: 'hunter2' })
})

// Right
Given('{string} logs in', async function (name: string) {
  await this.call(name, 'auth:login', logins.get(name))
  this.setSession(name, (this.lastResult as { token: string }))
})
```
