import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { z } from 'zod'
import {
  staticRoutes,
  sweepAllPages,
  type ActorSession,
} from '@pikku/playwright'
import { pikkuScenarioStep } from '#pikku/scenarios'

/**
 * The generic browser vocabulary, the scenario equivalent of what
 * `registerBrowserSteps` from `@pikku/cucumber/browser` used to supply. Keep
 * this file generic — per-domain steps belong in their own `*.steps.ts`
 * alongside the feature that uses them.
 *
 * The runner opens one BrowserContext per actor and signs it in at
 * `signInPath` BEFORE the first step runs, so there is no "log in" step and no
 * signed-out state to drive. A scenario that must start signed out clears the
 * context itself (`browser.context.clearCookies()`), which only makes sense in
 * one that creates an identity.
 *
 * Do NOT set `XBROWSER_CDP_URL` in a sandbox. `@pikku/playwright` connects over
 * CDP whenever that variable is present and launches the in-image chromium
 * (`PLAYWRIGHT_CHROMIUM_PATH`) otherwise — setting it routes the whole sweep to
 * an off-box browser that cannot reach this app, which reads as every page
 * failing at once.
 */

/** `wire.browser` is the driver's session; the sweep needs its issue collector. */
const session = (browser: unknown) => browser as ActorSession

export const OpensPageInput = z.object({
  /** App-relative path, e.g. `/app`. */
  path: z.string(),
})

export const OpensPageOutput = z.object({
  /** Where the browser actually came to rest — a guard redirect shows up here. */
  pathname: z.string(),
  status: z.number().nullable(),
})

/**
 * Open one app page as the step's actor and report where it landed.
 *
 * Returns rather than asserts: a scenario that expects a redirect and one that
 * forbids it both read the same value, and the landed path appears in the run
 * record either way.
 */
// @snippet start scenarioStepDefinition
export const opensPage = pikkuScenarioStep({
  name: 'opensPage',
  description: 'opens an app page as the signed-in actor',
  template: 'opens {path}',
  input: OpensPageInput,
  output: OpensPageOutput,
  browser: async (_services, { path }, { browser }) => {
    const actor = session(browser)
    const status = await actor.gotoApp(path)
    let pathname = path
    try {
      pathname = new URL(actor.page.url()).pathname
    } catch {
      // A page that never navigated keeps the requested path — the assertion in
      // the scenario is what reports that, not a thrown URL parse error.
    }
    return { pathname, status }
  },
})
// @snippet end scenarioStepDefinition

export const SeesTextInput = z.object({
  text: z.string(),
})

export const SeesTextOutput = z.object({
  text: z.string(),
})

/** Wait for a string to appear on the page, failing with the driver's own timeout. */
export const seesText = pikkuScenarioStep({
  name: 'seesText',
  description: 'waits for text to appear on the current page',
  template: 'sees {text}',
  input: SeesTextInput,
  output: SeesTextOutput,
  browser: async (_services, { text }, { browser }) => {
    await session(browser).expectText(text)
    return { text }
  },
})

export const RestsOnPathInput = z.object({
  /** App-relative path the actor should have come to rest on, e.g. `/app`. */
  path: z.string(),
})

export const RestsOnPathOutput = z.object({
  pathname: z.string(),
})

/** `/app/` and `/app` are the same route; compare them as such. */
const normalisePath = (path: string) => path.replace(/\/+$/, '') || '/'

/**
 * Assert the browser came to rest on exactly a path, naming where it went if not.
 *
 * This is the assertion half of `opensPage`, which deliberately only reports
 * where it landed. Keeping it a step rather than an `if`/`throw` in the scenario
 * body is what makes it count toward witness coverage — an assertion-free ladder
 * proves only that nothing threw, and the inspector fails the build over it
 * (PKU680).
 *
 * It asserts on the URL rather than page copy because every scaffolded app
 * rewrites its own copy; the route guard's behaviour is what the template can
 * still speak for. The match is exact rather than a prefix on purpose — the
 * redirect this exists to catch is `/app` → `/app/login`, which any prefix test
 * would happily accept.
 */
export const restsOnPath = pikkuScenarioStep({
  name: 'restsOnPath',
  description: 'asserts the browser came to rest on an app path',
  template: 'is on {path}',
  input: RestsOnPathInput,
  output: RestsOnPathOutput,
  browser: async (_services, { path }, { browser }) => {
    const actor = session(browser)
    const pathname = new URL(actor.page.url()).pathname
    if (normalisePath(pathname) !== normalisePath(path)) {
      throw new Error(
        `Expected to be on ${path}, but the browser rests on ${pathname}. ` +
          `A bounce to a login route means the session cookie did not carry, or the route guard rejected it.`
      )
    }
    return { pathname }
  },
})

export const SweepsAllPagesInput = z.object({
  /**
   * Where each app's generated `src/routeTree.gen.ts` is read from, relative to
   * the directory `pikku scenario run` was invoked in — the repo root, hence `.`.
   */
  repoRoot: z.string().default('.'),
})

export const SweepsAllPagesOutput = z.object({
  routes: z.array(z.string()),
})

/**
 * Visit every static route and fail on the first page that is not clean.
 *
 * "Clean" means: no HTTP error, no failed or 5xx app API call, no uncaught
 * exception, no console error, and no bounce to `/app/login`. Routes come from the
 * generated TanStack route tree, so a new page is swept the moment it exists —
 * nothing here lists them. Parameterised routes and the auth pages are skipped
 * by `staticRoutes`.
 *
 * `sweepAllPages` retries a page whose only problems are transient (an aborted
 * request, a 502/503/504, a login bounce during a dev-server restart), so a
 * failure reported here is a failure that survived three attempts.
 */
export const sweepsAllPages = pikkuScenarioStep({
  name: 'sweepsAllPages',
  description: 'visits every static route and fails on any runtime error',
  template: 'every page loads without errors',
  input: SweepsAllPagesInput,
  output: SweepsAllPagesOutput,
  browser: async (_services, { repoRoot }, { browser }) => {
    const actor = session(browser)
    await actor.waitForServerReady()
    await sweepAllPages(actor, repoRoot)
    return { routes: staticRoutes(repoRoot) }
  },
})

export const CapturesPageInput = z.object({
  /** App-relative path, e.g. `/app/front-desk`. */
  path: z.string(),
  /** File stem; the run writes `<outDir>/<name>.png`. */
  name: z.string(),
  /** Where to write, relative to the repo root. */
  outDir: z.string().default('screenshots'),
  /** Viewport width. 375 is an iPhone SE — the narrowest width worth designing for. */
  width: z.number().default(1280),
  /** Viewport height. */
  height: z.number().default(720),
  /**
   * Colour scheme to photograph.
   *
   * Written into the app's own localStorage key before the first paint, not
   * clicked afterwards: toggling post-load photographs a transition, and the
   * scheme has to be in place before the theme resolves its variables.
   */
  scheme: z.enum(['light', 'dark']).default('light'),
})

export const CapturesPageOutput = z.object({
  file: z.string(),
  pathname: z.string(),
  status: z.number().nullable(),
  /** Anything the page did wrong while being photographed. */
  consoleErrors: z.array(z.string()),
  pageErrors: z.array(z.string()),
  failedRequests: z.array(z.string()),
  apiErrors: z.array(z.string()),
})

/**
 * Photograph one page as the signed-in actor.
 *
 * Deliberately returns the page's issues alongside the file. A screenshot alone
 * is a picture of a page that may be quietly broken — a failed API call renders
 * as an empty list, which photographs as a design decision. Capturing both
 * means the image and the reason it looks that way arrive together.
 *
 * The driver signs the actor in before the first step, so this reaches
 * authenticated pages that a bare browser cannot.
 */
export const capturesPage = pikkuScenarioStep({
  name: 'capturesPage',
  description: 'screenshots an app page as the signed-in actor',
  template: 'captures {path} as {name}',
  input: CapturesPageInput,
  output: CapturesPageOutput,
  browser: async (
    _services,
    { path, name, outDir, width, height, scheme },
    { browser }
  ) => {
    const actor = session(browser)
    actor.resetIssues()

    await actor.page.setViewportSize({ width, height })
    await actor.page.addInitScript(
      ([key, value]) =>
        window.localStorage.setItem(key as string, value as string),
      ['app-color-scheme', scheme]
    )
    const status = await actor.gotoApp(path)

    // Wait for the page to stop being a loading state before photographing it.
    //
    // `gotoApp` resolves once the document is ready, which is *before* the
    // queries it fired have answered. A screenshot taken there is a picture of
    // skeletons — and a skeleton photographs as a design decision rather than
    // as a page that had not finished loading, so the reviewer critiques the
    // wrong thing. Both waits are best-effort: a page that never goes idle is
    // still worth a picture, and the issue list will say why.
    await actor.page.waitForLoadState('networkidle').catch(() => {})
    await actor.page
      .locator('[class*="mantine-Skeleton-root"]')
      .first()
      .waitFor({ state: 'detached', timeout: 5_000 })
      .catch(() => {})

    // No argument. `screenshot(name)` forwards it to Playwright as `{ path: name }`,
    // so passing one made the driver write the file itself — into the process's
    // cwd, `packages/functions/home.png` — on top of the copy this step writes
    // below. Called bare it returns the bytes and writes nothing, which leaves
    // exactly one file and this step owning where it goes.
    const bytes = await actor.screenshot()

    const dir = resolve(outDir)
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `${name}.png`)
    writeFileSync(file, bytes)

    let pathname = path
    try {
      pathname = new URL(actor.page.url()).pathname
    } catch {
      // Keep the requested path; the scenario reports the discrepancy.
    }

    const issues = actor.takeIssues()

    // The analytics beacon is fired and then abandoned when the page navigates,
    // so `net::ERR_ABORTED` against it is the design working rather than a
    // fault. Counting it made every single page report `clean: false`, which
    // costs the flag the only thing it is for — being believed when it is false.
    const failedRequests = issues.failedRequests.filter(
      (request) =>
        !(request.includes('/analytics') && request.includes('ERR_ABORTED'))
    )

    return { file, pathname, status, ...issues, failedRequests }
  },
})

export const ClicksInput = z.object({
  /** Accessible name of the control — its visible label. */
  name: z.string(),
})

export const ClicksOutput = z.object({
  name: z.string(),
  /** Where the click left the browser, so a scenario can assert the landing. */
  pathname: z.string(),
})

/**
 * Click the link or button a person would click, found by its visible label.
 *
 * By accessible name rather than a test id on purpose: a journey should fail
 * when the control a user looks for is not there, and a test id can be present
 * on a control nobody can find. If this step cannot locate the name, the app
 * does not offer that action — which is the finding, not a flaky selector.
 */
export const clicks = pikkuScenarioStep({
  name: 'clicks',
  description: 'clicks a link or button by its visible label',
  template: 'clicks {name}',
  input: ClicksInput,
  output: ClicksOutput,
  browser: async (_services, { name }, { browser }) => {
    const actor = session(browser)
    // `exact: true` is load-bearing. With substring matching, `clicks('Basket')`
    // silently matched the "Add to basket" button — so a journey against an app
    // with no basket screen reported that step as passing and failed two steps
    // later for the wrong reason. A control that does not exist must not be
    // satisfiable by a different control that happens to contain its name.
    const target = actor.page
      .getByRole('link', { name, exact: true })
      .or(actor.page.getByRole('button', { name, exact: true }))
      .first()
    await target.waitFor({ state: 'visible', timeout: 5_000 })
    await target.click()
    await actor.page.waitForLoadState('networkidle').catch(() => {})
    let pathname = ''
    try {
      pathname = new URL(actor.page.url()).pathname
    } catch {
      // Keep it empty; the scenario's own assertion reports the discrepancy.
    }
    return { name, pathname }
  },
})

export const DoesNotSeeTextInput = z.object({
  text: z.string(),
})

export const DoesNotSeeTextOutput = z.object({
  text: z.string(),
})

/**
 * Assert text is absent from the page.
 *
 * The negative half of `seesText`, and the only way to test a claim of the form
 * "and nothing from the workspace you do not belong to". A leak is invisible to
 * every positive assertion: the page shows what it should AND what it should
 * not, and every `seesText` still passes.
 */
export const doesNotSeeText = pikkuScenarioStep({
  name: 'doesNotSeeText',
  description: 'asserts text is absent from the current page',
  template: 'does not see {text}',
  input: DoesNotSeeTextInput,
  output: DoesNotSeeTextOutput,
  browser: async (_services, { text }, { browser }) => {
    const actor = session(browser)
    // Settle first: asserting absence against a page still loading passes for
    // the wrong reason, and would keep passing after the leak arrived.
    await actor.page.waitForLoadState('networkidle').catch(() => {})
    const count = await actor.page.getByText(text, { exact: false }).count()
    if (count > 0) {
      throw new Error(
        `expected "${text}" to be absent, but it is on the page ${count} time(s)`
      )
    }
    return { text }
  },
})

export const ClicksNearInput = z.object({
  /** Text identifying the row or card to act within, e.g. the product name. */
  near: z.string(),
  /** Accessible name of the control inside it. */
  name: z.string(),
})

export const ClicksNearOutput = z.object({
  near: z.string(),
  name: z.string(),
})

/**
 * Click a control inside the row or card that contains some text.
 *
 * A list page repeats its controls: eight products, eight "Add to basket"
 * buttons. `clicks` takes the first, which silently acts on the wrong row — a
 * journey that says "sees the mug, adds it to the basket" then adds the
 * espresso, and only fails later, somewhere else, for a reason that looks
 * unrelated. This is the step for "the button next to that one", which is what
 * a person actually does, and it makes the assertion independent of list order.
 *
 * The container is matched loosely (card, table row, list item) so the same step
 * serves a grid and a table without the scenario knowing which it is looking at.
 */
export const clicksNear = pikkuScenarioStep({
  name: 'clicksNear',
  description: 'clicks a control inside the row or card containing some text',
  template: 'clicks {name} next to {near}',
  input: ClicksNearInput,
  output: ClicksNearOutput,
  browser: async (_services, { near, name }, { browser }) => {
    const actor = session(browser)
    const control = actor.page.getByRole('button', { name, exact: true })
    const container = actor.page
      .locator('[class*="mantine-Card-root"], tr, li, article')
      .filter({ hasText: near })
      .filter({ has: control })
      .last()
    await container.waitFor({ state: 'visible', timeout: 5_000 })
    await container.getByRole('button', { name, exact: true }).first().click()
    await actor.page.waitForLoadState('networkidle').catch(() => {})
    return { near, name }
  },
})

export const TypesIntoInput = z.object({
  /** The field's visible label or placeholder. */
  label: z.string(),
  text: z.string(),
})

export const TypesIntoOutput = z.object({
  label: z.string(),
})

/**
 * Type into the field a person would find, by its label.
 *
 * Located by accessible name rather than by test id for the same reason
 * `clicks` is: a field nobody can identify on screen is a field that does not
 * exist for them, and this step should fail when that is true.
 */
export const typesInto = pikkuScenarioStep({
  name: 'typesInto',
  description: 'types text into a field found by its label',
  template: 'types {text} into {label}',
  input: TypesIntoInput,
  output: TypesIntoOutput,
  browser: async (_services, { label, text }, { browser }) => {
    const actor = session(browser)
    const field = actor.page
      .getByLabel(label, { exact: false })
      .or(actor.page.getByPlaceholder(label, { exact: false }))
      .first()
    await field.waitFor({ state: 'visible', timeout: 5_000 })
    await field.fill(text)
    return { label }
  },
})

export const PostsToInput = z.object({
  /** App-relative path, e.g. `/api/webhooks/payment`. */
  path: z.string(),
  /** JSON body, as a string so the step's schema stays simple. */
  body: z.string().default('{}'),
  /**
   * Highest status treated as success.
   *
   * Defaulted rather than optional because the first version of this step
   * returned the status and asserted nothing — so a 403 from the analytics
   * origin lock passed exactly like a 204, and the step could not fail.
   */
  maxStatus: z.number().default(299),
  /**
   * Lower bound, for asserting a rejection. Without it a step could only say
   * "this did not fail", which passes just as well when the server quietly
   * ignored the body as when it did the work.
   */
  minStatus: z.number().default(0),
  /**
   * Substring the response body must contain. Optional rather than defaulted:
   * a defaulted field becomes required at every existing call site, because a
   * step's input type is the schema's OUTPUT.
   */
  expectBody: z.string().optional(),
})

export const PostsToOutput = z.object({
  status: z.number(),
  body: z.string(),
})

/**
 * POST to a route from inside the signed-in browser.
 *
 * The reason this exists: not every surface is RPC. A gateway receiver, an
 * analytics beacon and an MCP endpoint are all reachable only over their own
 * HTTP route, so `scenario.do` cannot call them and they went untested — while
 * the alternative, exposing them over the generic RPC endpoint purely so a test
 * could reach them, would weaken exactly the boundary they demonstrate.
 *
 * Issued from the browser context rather than from Node so the request carries
 * the real session cookie and the real `Origin` header. The analytics ingest
 * rejects a request without one, and a test that cannot produce a correct
 * Origin cannot prove the ingest works.
 */
export const postsTo = pikkuScenarioStep({
  name: 'postsTo',
  description: 'posts to an app route from the signed-in browser',
  template: 'posts to {path}',
  input: PostsToInput,
  output: PostsToOutput,
  browser: async (
    _services,
    { path, body, maxStatus, minStatus, expectBody },
    { browser }
  ) => {
    const actor = session(browser)
    const result = await actor.page.evaluate(
      async ([target, payload]) => {
        const response = await fetch(target as string, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: payload as string,
        })
        return {
          status: response.status,
          body: (await response.text()).slice(0, 400),
        }
      },
      [path, body]
    )
    if (result.status > maxStatus || result.status < minStatus) {
      throw new Error(
        `POST ${path} returned ${result.status}, expected ${minStatus}..${maxStatus}: ${result.body}`
      )
    }
    if (expectBody && !result.body.includes(expectBody)) {
      throw new Error(
        `POST ${path} answered ${result.status} but the body did not contain ${JSON.stringify(expectBody)}: ${result.body}`
      )
    }
    return result
  },
})

export const SubscribesToChannelInput = z.object({
  /** Channel route, e.g. `/editorial`. */
  route: z.string(),
  /** The action that subscribes the channel to its event hub. */
  action: z.string(),
  /**
   * The action that unsubscribes again. Optional: not every channel has one,
   * but where it exists it is half the lifecycle, and a step that only ever
   * subscribes leaves it untested — which is how `unsubscribeFromOrder` stayed
   * wired and uncalled.
   */
  unsubscribeAction: z.string().optional(),
})

export const SubscribesToChannelOutput = z.object({
  connected: z.boolean(),
})

/**
 * Open the channel and subscribe, from the signed-in browser.
 *
 * Nothing tested the realtime surface at all. `LiveFeed` opens a socket when it
 * mounts, so a journey that visits the page does cause the handler to run — but
 * a subscription made by a component at runtime is invisible to any static
 * reader, and "it probably connected" is not an assertion.
 *
 * This opens the socket explicitly and fails if it does not reach OPEN, which is
 * the part that was never verified: a channel whose auth or route is wrong looks
 * exactly like a quiet one.
 */
export const subscribesToChannel = pikkuScenarioStep({
  name: 'subscribesToChannel',
  description: 'opens an app channel and sends its subscribe action',
  template: 'subscribes to {route}',
  input: SubscribesToChannelInput,
  output: SubscribesToChannelOutput,
  browser: async (
    _services,
    { route, action, unsubscribeAction },
    { browser }
  ) => {
    const actor = session(browser)
    const connected = await actor.page.evaluate(
      async ([path, act, unsub]) => {
        const url = `${location.origin.replace(/^http/, 'ws')}/api${path}`
        return await new Promise<boolean>((resolve) => {
          let socket: WebSocket
          try {
            socket = new WebSocket(url)
          } catch {
            resolve(false)
            return
          }
          const timer = setTimeout(() => {
            try {
              socket.close()
            } catch {
              /* already gone */
            }
            resolve(false)
          }, 5000)
          socket.addEventListener('open', () => {
            socket.send(JSON.stringify({ action: act }))
            clearTimeout(timer)
            // Close deliberately: the disconnect handler is half the channel's
            // lifecycle and nothing had ever run it.
            setTimeout(() => {
              if (unsub) {
                socket.send(JSON.stringify({ action: unsub }))
              }
              try {
                socket.close()
              } catch {
                /* already gone */
              }
              resolve(true)
            }, 250)
          })
          socket.addEventListener('error', () => {
            clearTimeout(timer)
            resolve(false)
          })
        })
      },
      [route, action, unsubscribeAction ?? null]
    )
    if (!connected) {
      throw new Error(`channel ${route} did not accept a connection`)
    }
    return { connected }
  },
})

export const CallsMcpToolInput = z.object({
  /** Tool name as it appears in `tools/list` — the pikku function name. */
  tool: z.string(),
  /** Tool arguments, JSON-encoded. */
  args: z.string().default('{}'),
})

export const CallsMcpToolOutput = z.object({
  text: z.string(),
  /** Tool names the server advertised, so a scenario can assert the catalogue. */
  advertised: z.array(z.string()),
})

/**
 * Call an MCP tool with a real MCP client.
 *
 * This used to be a hand-built JSON-RPC envelope posted with `fetch`, which
 * tested our own idea of the protocol rather than the protocol. It skipped the
 * `initialize` handshake entirely, never negotiated capabilities, and parsed the
 * SSE frame by hand — so it could have passed against a server no real client
 * could talk to. The official SDK does the handshake, the session id and the
 * framing, which is the whole point of testing this surface at all.
 *
 * The caller's identity comes from the actor's browser cookies, forwarded as a
 * header. Nothing about MCP requires a browser — a deployed agent would send a
 * bearer token or an OAuth credential instead — but the personas' authority
 * lives in their session, and reusing it proves the property these templates
 * advertise: an agent gets exactly the scopes the person driving it has.
 */
export const callsMcpTool = pikkuScenarioStep({
  name: 'callsMcpTool',
  description:
    'calls an MCP tool with a real MCP client, as the signed-in actor',
  template: 'calls the {tool} MCP tool',
  input: CallsMcpToolInput,
  output: CallsMcpToolOutput,
  browser: async (_services, { tool, args }, { browser }) => {
    const actor = session(browser)
    // The app origin, so the client goes through the same proxy the browser
    // does and the driver's per-template ports need no repeating here.
    if (!actor.page.url().startsWith('http')) {
      await actor.gotoApp('/')
    }
    const origin = new URL(actor.page.url()).origin

    const cookies = await actor.page.context().cookies()
    const cookieHeader = cookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ')

    const transport = new StreamableHTTPClientTransport(
      new URL('/api/mcp', origin),
      { requestInit: { headers: { Cookie: cookieHeader } } }
    )
    const client = new Client(
      { name: 'pikku-scenario', version: '1.0.0' },
      { capabilities: {} }
    )

    try {
      // Performs initialize; throws if the server does not complete it.
      await client.connect(transport)
      const advertised = (await client.listTools()).tools.map((t) => t.name)
      if (!advertised.includes(tool)) {
        throw new Error(
          `MCP server does not advertise '${tool}' — it offers: ${advertised.join(', ') || '(none)'}`
        )
      }

      const result = (await client.callTool({
        name: tool,
        arguments: JSON.parse(args),
      })) as { isError?: boolean; content?: Array<{ text?: string }> }

      const text = (result.content ?? [])
        .map((part) => part.text ?? '')
        .join('\n')
      // `isError` is how a tool reports failure — the call itself still succeeds,
      // so not checking it would let every broken tool pass.
      if (result.isError) {
        throw new Error(`MCP ${tool} reported an error: ${text.slice(0, 300)}`)
      }
      return { text, advertised }
    } finally {
      await client.close().catch(() => {})
    }
  },
})
