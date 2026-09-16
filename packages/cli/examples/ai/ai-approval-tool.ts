//~ name: ai-approval-tool
//~ title: Agent tool that needs HUMAN APPROVAL before it runs (human-in-the-loop) — approvalRequired + approvalDescription
//~ when: An AI agent (see ai-agent) must be able to call a tool that has REAL-WORLD CONSEQUENCES — sends an email/message, charges a card, deletes records, posts publicly, moves money. You want the model to DECIDE to call it, but a HUMAN to confirm before it actually executes. This is the safe variant of an ai-agent tool: same pikkuFunc, plus `approvalRequired: true` and an `approvalDescription` so the user sees exactly what will happen and clicks approve/deny. Read-only lookups do NOT need this — only side-effecting tools.
//~ deferUntil: entity-write
//~ lang: ts

//~ steps:
//~ ═══ CLIENT SIDE — approval surfaces in the chat UI ═══
//~ The PikkuAgentChat component renders the pending tool call with your
//~ approvalDescription string and Approve / Deny buttons; approving resumes the run and
//~ the tool executes, denying tells the model it was rejected. You do NOT hand-roll an
//~ approval endpoint — the agent stream carries the approval round-trip. Just point the
//~ chat at agentName="billingAssistant" (see the ai-agent client snippet).
// ===== FILE: packages/functions/src/functions/send-invoice-email.function.ts =====
import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'

export const SendInvoiceEmailInput = z.object({
  to: z.string().email(),
  amountCents: z.number().int().positive(),
  note: z.string().optional(),
})
export const SendInvoiceEmailOutput = z.object({
  sent: z.boolean(),
})

//~ A NORMAL agent tool (a pikkuFunc with expose: true), but marked as gated:
//~   • approvalRequired: true — the agent runner does NOT execute this tool when the
//~     model calls it; it PAUSES and emits an approval request to the chat UI. The tool
//~     only runs after the user approves (deny = the model is told it was rejected and
//~     continues without the side effect). This is the human-in-the-loop switch.
//~   • approvalDescription — a resolver `(services, input) => Promise<string>` that turns
//~     the model's chosen ARGS into a plain-language confirmation string the user reads
//~     BEFORE approving. Make it specific and include the consequential values (who,
//~     how much) so "Approve?" is an informed choice, not a blind yes. It can hit
//~     services (e.g. look up a name) — keep it cheap, it runs on every proposed call.
export const sendInvoiceEmail = pikkuFunc({
  expose: true, //~ exposes the RPC AND makes it callable by the agent as a tool
  auth: true,
  description: 'Email an invoice to a customer. Side-effecting — requires approval.',
  input: SendInvoiceEmailInput,
  output: SendInvoiceEmailOutput,
  approvalRequired: true,
  approvalDescription: async (_services, input: z.infer<typeof SendInvoiceEmailInput>) =>
    `Email an invoice for $${(input.amountCents / 100).toFixed(2)} to ${input.to}?`,
  func: async ({ emailService }, input, { session }) => {
    //~ By the time this BODY runs the user has ALREADY approved — so just do the work.
    //~ Do the real side effect via injected services scoped to session.userId.
    void session
    await emailService.sendEmail({
      to: input.to,
      subject: 'Your invoice',
      //~ A real template lives in the email scaffold; this is illustrative.
      text: input.note ?? `Amount due: $${(input.amountCents / 100).toFixed(2)}`,
    } as Parameters<typeof emailService.sendEmail>[0])
    return { sent: true }
  },
})

// ===== FILE: packages/functions/src/agents/billing-assistant.agent.ts =====
import { pikkuAgent } from '#pikku/agent'
import { sendInvoiceEmail } from '../functions/send-invoice-email.function.js'

//~ The agent that may call it. It is defined EXACTLY like a normal ai-agent — the
//~ approval gating lives on the TOOL, not the agent. The model can propose the call
//~ whenever it makes sense; the runner enforces the human gate. Mix gated and un-gated
//~ tools freely (read-only tools run immediately; this one waits for approval).
export const billingAssistant = pikkuAgent({
  name: 'billingAssistant', //~ <-- IDENTICAL to the exported const; that identifier is the route AND the frontend agentName
  description: 'Helps staff prepare and send customer invoices.',
  goal: [
    'You help staff manage billing for this app.',
    'When the user asks to bill or email a customer, call sendInvoiceEmail with the right amount.',
    'The user will be asked to approve before any email is sent — do not claim it was sent until the tool returns.',
  ].join('\n'),
  model: 'openai/gpt-5.6-luna',
  tools: [sendInvoiceEmail],
  maxSteps: 6,
})
