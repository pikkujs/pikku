# Browser steps

Declaring a `browser` binding is the whole switch: inside that binding `wire.browser` is guaranteed present and non-optional, and a step without one never sees a browser at all. There is nothing to null-check.

A `browser` binding gets a session bound to **its actor**, signed in through the same `signInPath` + `SCENARIO_ACTOR_SECRET` path the HTTP actors use, so the browser and the RPC calls are one identity. Calling such a step without an actor is a critical error (`PKU677`).

Browser steps are where **intent, not actions** earns its keep: the step is one intent, the clicking lives in shared utilities, and the step arrives before it acts. Write the mechanics below into utilities and keep the step body to three or four calls that read as a sentence.

```typescript
export const opensTheCart = pikkuScenarioStep<
  { path: string },
  { url: string }
>({
  name: 'opensTheCart',
  description: 'opens the cart',
  browser: async (_services, { path }, { browser }) => {
    await browser.goto(path)
    return { url: browser.page.url() }
  },
  default: async (_services, _data, { actor }) => ({
    url: (await actor.invoke('getCart', {})).url,
  }),
})
```

- Install `@pikku/playwright` and `@playwright/test`, and import `@pikku/playwright` once (`import type {} from '@pikku/playwright'`) so `browser.page` is a typed Playwright `Page`. Without it you still get the structural `goto`/`screenshot` handle.
- The environment needs an `appUrl` beside its `apiUrl`. `pikku scenario run` fails fast before running anything if a browser scenario has no `appUrl` or the driver is not installed.
- A browser step only launches a browser under `--run browser`; under the default surface it takes its default path instead. A scenario with no binding for the run's surface and no default is reported as **could not run** and fails the run — hold it back with `--exclude-tags`, not with the expectation of a silent skip.
- Playwright auto-waits; do not wrap `page.click` in `expectEventually`.

## Locate by message key, never by rendered copy

If the app is translated, **no step may contain a user-visible string.** `getByLabel('Full Name')` passes only while the browser happens to render the base locale, and any copy edit turns it into a selector timeout that points at the wizard rather than at the rename that caused it — the test looks broken where it is merely stale.

The message catalogue already holds the string under a key. Read it from there. Type the lookup off the catalogue JSON so a renamed or misspelled key is a **compile** error rather than a run-time timeout:

```typescript
// tests/scenarios/i18n.ts
import type messages from '../../../../apps/web/messages/en.json'

export type MessageKey = keyof typeof messages

export const t = (key: MessageKey, locale = baseLocale): string => {
  /* … */
}
```

```typescript
await page.getByLabel(t('jobs_apply_fullname')).fill(identity.name)
await page
  .getByRole('button', { name: t('jobs_apply_submit'), exact: true })
  .click()
```

- Type off `messages/<baseLocale>.json`, **not** the generated Paraglide output — `i18n/paraglide/` is build output, so typing against it makes the tests unbuildable until the app has been built. The JSON is the tracked source.
- Fall back to the base locale for a key a locale has not translated. That is what Paraglide does at run time, so a helper that throws instead would disagree with the screen the test is looking at.
- This is not only about locators. A copy literal passed to a **project helper** (`pick('Where would you like to work?', …)`) reaches the DOM the same way, and so does a pane name quoted back in a failure message. `pikku fabric validate` scans every string in a `*.steps.ts` / `*.scenario.ts` against the base catalogue and errors on any verbatim match, wherever it sits — except comments, and the `name` / `description` / `template` declared directly on a `pikkuFeature`, `pikkuScenario` or `pikkuScenarioStep`, which are Console meta written in the project's `locale` rather than app copy.
- A regex locator (`{ name: /^Next$/i }`) hides the literal but not the problem. `{ name: t('key'), exact: true }` is both stricter and locale-correct.
- Strings the catalogue does not own — a test id, a fixture filename, a seeded value — stay literal. The catalogue is the test for whether something is copy.