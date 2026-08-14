/**
 * Driving the console's agent playground.
 *
 * These are the steps a protocol test cannot stand in for: the approval card as
 * it actually renders, mixed approve/deny across several cards in one turn, and
 * a multi-turn conversation typed into the composer. The agent protocol itself
 * is covered without a browser by the `agent-protocol` suite — nothing here
 * should re-assert it.
 *
 * Everything is addressed by test id or data attribute rather than by the
 * console's copy. The playground's copy goes through the `m` i18n namespace, so
 * a step that clicked a button called "Approve" would break the moment the
 * console is translated — and the approval flow is precisely what these
 * scenarios exist to check.
 *
 * The scenarios these serve run against a REAL model: they assert that the
 * agent routed an English request to the right tool with the right arguments,
 * which is a decision a scripted mock makes for it. They are tagged `ai-live`
 * and are held out of the default console run.
 */
import { randomUUID } from 'node:crypto'
import { pikkuScenarioStep } from '#pikku/workflow/pikku-workflow-types.gen.js'
import type { PikkuBrowserWire, TestIdSelector } from '@pikku/core/scenario'
import { expect, testIdSelector } from '@pikku/playwright'

/** How long a model-backed turn is given to complete. */
const RESPONSE_TIMEOUT = 60_000

const COMPOSER: TestIdSelector = { testId: 'agent-composer' }
const PENDING_APPROVAL: TestIdSelector = {
  testId: 'approval-card',
  where: { 'data-approval-state': 'pending' },
}

/** One approval card's own state, whatever it resolved to. */
const approvalCard = (state: string): TestIdSelector => ({
  testId: 'approval-card',
  where: { 'data-approval-state': state },
})

/**
 * Waits for the composer to be enabled, which is the playground's signal that
 * the runtime is idle again.
 *
 * Read off the DOM rather than through a matcher because `disabled` on the
 * composer is the signal, and it is the runtime's own flag — not a state
 * Playwright can wait on without also waiting on visibility.
 */
const waitForComposerEnabled = async (browser: PikkuBrowserWire) => {
  await browser.page.waitForFunction(
    (selector) => {
      const composer = document.querySelector(
        selector
      ) as HTMLTextAreaElement | null
      return composer && !composer.disabled
    },
    testIdSelector(COMPOSER),
    { timeout: RESPONSE_TIMEOUT }
  )
}

export const opensAgentPlayground = pikkuScenarioStep<
  { agent: string },
  { threadId: string }
>({
  name: 'opensAgentPlayground',
  description: 'opens an agent playground on a fresh thread',
  template: 'opens the {agent} playground',
  browser: async (_services, { agent }, { browser }) => {
    const threadId = randomUUID()
    await browser.goto(
      `/console/agents/playground?id=${agent}&threadId=${threadId}`
    )
    // Either the composer or the credential gate is a legitimate landing
    // state — which one appears is the subject of the credential scenarios.
    await Promise.race([
      browser
        .locate(COMPOSER)
        .waitFor({ state: 'visible', timeout: RESPONSE_TIMEOUT }),
      browser
        .locate({ testId: 'agent-credential-prompt' })
        .waitFor({ state: 'visible', timeout: RESPONSE_TIMEOUT }),
    ])
    return { threadId }
  },
})

/**
 * Types a message and sends it, confirming the runtime actually took it.
 *
 * The retry loop is not defensive padding. assistant-ui silently drops
 * `composer.send()` while a run is in flight, and the composer's enabled state
 * does not track `thread.isRunning` — so the first submit after an
 * approval-resume cycle can land mid-resume-run and be discarded with no error
 * anywhere. The only reliable evidence the message was consumed is the composer
 * clearing, and the only remedy is to send it again.
 *
 * The clear-wait is raced node-side as well as page-side: a page-side poll never
 * fires if the main thread is frozen, so its own timeout can hang far past the
 * limit it was given.
 *
 * A step gets no retries, so a failure here aborts the whole scenario rather
 * than one step. That is deliberate — a dropped message means every later
 * assertion is about the wrong conversation.
 */
export const sendsAgentMessage = pikkuScenarioStep<
  { message: string },
  { sent: string }
>({
  name: 'sendsAgentMessage',
  description: 'types a message into the composer and sends it',
  template: 'sends {message}',
  browser: async (_services, { message }, { browser }) => {
    const input = browser.locate(COMPOSER)
    await waitForComposerEnabled(browser)

    for (let attempt = 0; attempt < 5; attempt++) {
      // Brief settle for the assistant-ui runtime after approval-resume cycles
      await browser.page.waitForTimeout(1_000)

      await input.click()
      await input.fill(message)
      await Promise.race([
        browser.page
          .evaluate(() => {
            const form = document.querySelector('form')
            if (form) form.requestSubmit()
          })
          .catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, 5_000)),
      ])

      try {
        await Promise.race([
          browser.page.waitForFunction(
            (selector) => {
              const composer = document.querySelector(
                selector
              ) as HTMLTextAreaElement | null
              return composer && composer.value === ''
            },
            testIdSelector(COMPOSER),
            { timeout: 5_000 }
          ),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('cleared-wait timed out')), 6_000)
          ),
        ])
        return { sent: message }
      } catch {
        await waitForComposerEnabled(browser)
      }
    }
    throw new Error(`Message was not consumed after 5 attempts: "${message}"`)
  },
})

export const waitsForAgentResponse = pikkuScenarioStep<void, { idle: true }>({
  name: 'waitsForAgentResponse',
  description: 'waits for the agent to finish responding',
  template: 'waits for the response',
  browser: async (_services, _data, { browser }) => {
    await waitForComposerEnabled(browser)
    return { idle: true }
  },
})

export const seesApprovalRequests = pikkuScenarioStep<
  { count?: number },
  { count: number }
>({
  name: 'seesApprovalRequests',
  description: 'sees pending approval requests',
  template: 'sees the approval request(s)',
  browser: async (_services, { count }, { browser }) => {
    const cards = browser.locate(PENDING_APPROVAL)
    await cards.first().waitFor({ state: 'visible', timeout: RESPONSE_TIMEOUT })
    if (count !== undefined) {
      await expect(cards).toHaveCount(count, { timeout: RESPONSE_TIMEOUT })
    }
    return { count: await cards.count() }
  },
})

/**
 * Asserts the reason the agent gave for wanting the call.
 *
 * The reason is the agent's own text, not console copy, so matching on it is
 * matching on the subject of the assertion rather than on a translated label.
 */
export const expectsApprovalReason = pikkuScenarioStep<
  { containing: string },
  { reason: string }
>({
  name: 'expectsApprovalReason',
  description: 'expects a pending approval to explain itself',
  template: 'expects the approval reason to mention {containing}',
  browser: async (_services, { containing }, { browser }) => {
    const reasons = browser.locate({
      testId: 'approval-reason',
      within: PENDING_APPROVAL,
    })
    await reasons
      .first()
      .waitFor({ state: 'visible', timeout: RESPONSE_TIMEOUT })
    const texts = await reasons.allTextContents()
    const needle = containing.toLowerCase()
    const match = texts.find((text) => text.toLowerCase().includes(needle))
    if (!match) {
      throw new Error(
        `No pending approval mentions "${containing}". Reasons: ${texts.join(' | ') || 'none'}`
      )
    }
    return { reason: match }
  },
})

export const respondsToApproval = pikkuScenarioStep<
  { decision: 'approve' | 'deny' },
  { decision: string }
>({
  name: 'respondsToApproval',
  description: 'approves or denies the first pending request',
  template: '{decision}s the request',
  browser: async (_services, { decision }, { browser }) => {
    await browser
      .locate({ testId: `approval-${decision}`, within: PENDING_APPROVAL })
      .first()
      .click({ timeout: RESPONSE_TIMEOUT })
    await waitForComposerEnabled(browser)
    return { decision }
  },
})

/**
 * Clears every pending request, including any raised while clearing.
 *
 * An agent may call its tools in sequence rather than all at once, so a fresh
 * card can appear after the previous batch resumes — approving only what was on
 * screen at the start would leave the run suspended.
 */
export const approvesAllPending = pikkuScenarioStep<void, { approved: number }>(
  {
    name: 'approvesAllPending',
    description: 'approves every pending request, including any that follow',
    template: 'approves everything pending',
    browser: async (_services, _data, { browser }) => {
      let approved = 0
      for (let round = 0; round < 10; round++) {
        const buttons = browser.locate({
          testId: 'approval-approve',
          within: PENDING_APPROVAL,
        })
        const count = await buttons.count()
        if (count === 0) break
        for (let i = 0; i < count; i++) {
          await buttons.first().click({ timeout: RESPONSE_TIMEOUT })
          approved++
        }
        await waitForComposerEnabled(browser)
      }
      return { approved }
    },
  }
)

/**
 * Denies one request out of a batch and approves the others.
 *
 * Cards are addressed as `.first()` each time rather than by index, because a
 * card leaves the pending set as soon as it is answered — so the nth card is
 * only the nth one until the first click lands.
 */
export const deniesNthApprovesRest = pikkuScenarioStep<
  { nth: number },
  { denied: number; approved: number }
>({
  name: 'deniesNthApprovesRest',
  description: 'denies one request in a batch and approves the rest',
  template: 'denies request {nth} and approves the rest',
  browser: async (_services, { nth }, { browser }) => {
    const pending = browser.locate(PENDING_APPROVAL)
    const count = await pending.count()
    let approved = 0
    for (let i = 0; i < count; i++) {
      const action = i === nth - 1 ? 'deny' : 'approve'
      await browser
        .locate({ testId: `approval-${action}`, within: PENDING_APPROVAL })
        .first()
        .click({ timeout: RESPONSE_TIMEOUT })
      if (action === 'approve') approved++
    }
    await waitForComposerEnabled(browser)
    return { denied: count > 0 ? 1 : 0, approved }
  },
})

/**
 * Counts how the answered approval cards resolved.
 *
 * The state is read from the card's own data attribute rather than from the
 * badge it renders, so the assertion survives translation.
 */
export const expectsApprovalOutcomes = pikkuScenarioStep<
  { approved?: number; denied?: number },
  { approved: number; denied: number }
>({
  name: 'expectsApprovalOutcomes',
  description: 'expects a given number of approved and denied requests',
  template: 'expects the approvals to have resolved as asked',
  browser: async (_services, { approved, denied }, { browser }) => {
    const countOf = async (state: string) =>
      browser.locate(approvalCard(state)).count()
    if (approved !== undefined) {
      await expect(browser.locate(approvalCard('approved'))).toHaveCount(
        approved,
        { timeout: RESPONSE_TIMEOUT }
      )
    }
    if (denied !== undefined) {
      await expect(browser.locate(approvalCard('denied'))).toHaveCount(denied, {
        timeout: RESPONSE_TIMEOUT,
      })
    }
    return {
      approved: await countOf('approved'),
      denied: await countOf('denied'),
    }
  },
})

/**
 * Waits for text to appear anywhere in the conversation.
 *
 * The whole page is the haystack because what is being asserted is that the
 * agent said something — it may land in an assistant message, a tool result or
 * an approval card, and which of those it is is not the point.
 */
export const seesInChat = pikkuScenarioStep<
  { text: string; caseSensitive?: boolean },
  { seen: string }
>({
  name: 'seesInChat',
  description: 'sees text somewhere in the conversation',
  template: 'sees {text} in the chat',
  browser: async (_services, { text, caseSensitive }, { browser }) => {
    await browser.page.waitForFunction(
      ({ needle, exact }) => {
        const body = document.body.innerText
        return exact
          ? body.includes(needle)
          : body.toLowerCase().includes(needle.toLowerCase())
      },
      { needle: text, exact: caseSensitive ?? false },
      { timeout: RESPONSE_TIMEOUT }
    )
    return { seen: text }
  },
})

export const doesNotSeeInChat = pikkuScenarioStep<
  { text: string },
  { absent: string }
>({
  name: 'doesNotSeeInChat',
  description: 'expects text to be absent from a settled conversation',
  template: 'does not see {text} in the chat',
  browser: async (_services, { text }, { browser }) => {
    await waitForComposerEnabled(browser)
    const body = await browser.page.innerText('body')
    if (body.toLowerCase().includes(text.toLowerCase())) {
      throw new Error(`Expected "${text}" to be absent from the conversation`)
    }
    return { absent: text }
  },
})

/**
 * Asserts on the newest assistant message alone.
 *
 * Scoping to the last block is what makes a negative meaningful in a multi-turn
 * conversation: the deleted todo is still on screen further up, in the turn that
 * created it, so asking the whole page would always fail.
 */
export const lastAssistantMessageExcludes = pikkuScenarioStep<
  { text: string },
  { checked: string }
>({
  name: 'lastAssistantMessageExcludes',
  description: 'expects the newest assistant message to omit some text',
  template: 'expects the last reply to omit {text}',
  browser: async (_services, { text }, { browser }) => {
    const blocks = browser.locate({ testId: 'assistant-block' })
    const count = await blocks.count()
    if (count === 0) {
      throw new Error('No assistant message has been rendered')
    }
    const last = (await blocks.nth(count - 1).innerText()) ?? ''
    if (last.toLowerCase().includes(text.toLowerCase())) {
      throw new Error(`Expected the last reply to omit "${text}", got: ${last}`)
    }
    return { checked: last }
  },
})

/**
 * Asserts no assistant message rendered empty.
 *
 * An empty bubble is how a silently dropped stream shows up: the turn appears to
 * have happened, the run reports success, and the reply is blank. Every scenario
 * that renders an assistant ends with this, which is what the cucumber suite's
 * pass-only `After` hook amounted to — it is really a trailing assertion, so it
 * is written as one.
 */
export const expectsNoEmptyAssistantBlocks = pikkuScenarioStep<
  void,
  { blocks: number }
>({
  name: 'expectsNoEmptyAssistantBlocks',
  description: 'expects every assistant message to have rendered content',
  template: 'expects no empty assistant messages',
  browser: async (_services, _data, { browser }) => {
    const blocks = browser.locate({ testId: 'assistant-block' })
    const count = await blocks.count()
    for (let i = 0; i < count; i++) {
      const text = ((await blocks.nth(i).innerText()) ?? '').trim()
      // Every block renders the "Assistant" author label, so a block holding
      // only that label is an empty one.
      const withoutLabel = text.replace(/^assistant\s*/i, '').trim()
      if (withoutLabel === '') {
        throw new Error(`Assistant message ${i + 1} of ${count} rendered empty`)
      }
    }
    return { blocks: count }
  },
})

/**
 * A tool asked for a credential part-way through a conversation.
 *
 * Distinct from the gate: the gate refuses to open a conversation at all, this
 * card interrupts one already under way and can be answered without leaving it.
 */
export const seesCredentialCard = pikkuScenarioStep<
  { credentialName: string },
  { credentialName: string }
>({
  name: 'seesCredentialCard',
  description: 'sees a mid-conversation request for a credential',
  template: 'sees the conversation ask for {credentialName}',
  browser: async (_services, { credentialName }, { browser }) => {
    await browser
      .locate({
        testId: 'credential-card',
        where: {
          'data-credential-state': 'pending',
          'data-credential-name': credentialName,
        },
      })
      .waitFor({ state: 'visible', timeout: RESPONSE_TIMEOUT })
    return { credentialName }
  },
})

/**
 * Completes the OAuth hand-off the credential card opens.
 *
 * The whole popup lifecycle stays inside this one step: a `Page` is not
 * serialisable, so it cannot be handed to a later step, and the console only
 * treats the credential as connected once the popup *closes* — a card left
 * open would leave the run suspended forever.
 */
export const connectsCredentialViaPopup = pikkuScenarioStep<
  void,
  { connected: true }
>({
  name: 'connectsCredentialViaPopup',
  description: 'completes the OAuth popup a credential card opens',
  template: 'connects the credential through the popup',
  browser: async (_services, _data, { browser }) => {
    const popupOpened = browser.page.waitForEvent('popup')
    await browser
      .locate({ testId: 'credential-connect' })
      .last()
      .click({ timeout: RESPONSE_TIMEOUT })
    const popup = await popupOpened
    await popup
      .getByText('success', { exact: false })
      .waitFor({ state: 'visible', timeout: 15_000 })
    await popup.close()
    return { connected: true }
  },
})

export const seesCredentialPrompt = pikkuScenarioStep<
  { credentialName: string },
  { credentialName: string }
>({
  name: 'seesCredentialPrompt',
  description: 'sees the playground gate asking for a credential',
  template: 'sees the gate asking for {credentialName}',
  browser: async (_services, { credentialName }, { browser }) => {
    await browser
      .locate({ testId: 'agent-credential-prompt' })
      .waitFor({ state: 'visible', timeout: RESPONSE_TIMEOUT })
    await browser
      .locate({
        testId: 'agent-credential-requirement',
        where: { 'data-credential-name': credentialName },
      })
      .waitFor({ state: 'visible', timeout: RESPONSE_TIMEOUT })
    return { credentialName }
  },
})
