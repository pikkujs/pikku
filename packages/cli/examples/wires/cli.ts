//~ name: cli
//~ title: Ops CLI (server-side, over a channel) — run app functions from the terminal
//~ when: A back-office / ops command-line tool that reuses the app's OWN pikku functions (list rows, force a state change, mark paid, reconcile, export). It is SERVER-SIDE: the CLI client connects to the running server over a channel and the functions execute there — nothing is bundled locally and it must not affect the web deploy. Defining the commands below is only the first of three steps; the entrypoint registration and the login flow are both listed under NEXT STEPS in this reply and the CLI is unusable without them.
//~ lang: ts
//~ steps:
//~ NEXT STEPS — the commands above are wired, but nothing can RUN them yet. Do both.
//~
//~ STEP 2 — write the /device approval page. Better Auth's device flow opens it with
//~ the code in the URL; the signed-in user reads the code back and clicks Approve, which
//~ unblocks the waiting terminal. Without it `login` has nowhere to confirm and hangs.
//~
//~ STEP 2 — register the SERVER-SIDE entrypoint in pikku.config.json.
//~ Add this under the top-level "cli" key (create it if absent), renaming "ops" to your
//~ own `program`. The key is `entrypoints`; pikku reads NOTHING else — a `cli` block of
//~ any other shape (a `programs` array, say) is silently ignored, no client is generated
//~ and every command fails. The `channel` variant makes the CLI connect to the running
//~ server and execute there; its generated wire goes under src/scaffold/ (a generated
//~ dir). All three paths are GENERATED (*.gen.ts) — never hand-write them; `pikku all`
//~ fills them in.
//~
//~   "cli": {
//~     "entrypoints": {
//~       "ops": [
//~         "client/cli-local.gen.ts",
//~         {
//~           "type": "channel",
//~           "wirePath": "packages/functions/src/scaffold/cli-channel.gen.ts",
//~           "path": "client/cli-client.gen.ts"
//~         }
//~       ]
//~     }
//~   }
//~
//~ STEP 3 — AUTH: make the CLI log in as a real user via Better Auth (built in).
//~ A command that reads/writes user data must run AS someone — the generated CLI client
//~ sends the caller's session on the WebSocket, so the app just needs the login endpoints
//~ turned on. This is the CLI's own `login` subcommand (the OAuth 2.0 device flow) and it
//~ is NOT on by default. The /device approval page was just written for you; do the rest:
//~  1. Add the two Better Auth plugins to the auth.ts `plugins: [...]`, then run
//~     `pikku db generate` and apply the migration it writes:
//~       deviceAuthorization()   # /auth/device/* endpoints (+ device_code table)
//~       bearer()                 # accept Authorization: Bearer <token> (no table)
//~     device-authorization is what `login` drives; bearer is what lets the token
//~     authenticate the WebSocket. Enable BOTH — one without the other leaves login
//~     half-wired and the failure looks like a hung terminal.
//~  2. Mark each command that needs a user `auth: true` in its pikkuCLICommand (a truly
//~     public command — a status ping — can stay auth:false). The channel resolves the
//~     bearer to a session the same way HTTP does, so `permissions` and `session` work in
//~     the command's func exactly as in the web app.
//~
//~ RUN IT (from the app repo, after the above ship). The CLI binary is named after
//~ `program` above — NOT `pikku`; login/whoami/logout are ITS subcommands:
//~     <program> login --url https://<your-app-url>   # opens the browser, confirm the code
//~     <program> <command> [--flags]                  # e.g. `ops lots --status live`
//~ The session is saved to ~/.pikku/session.json and every command reuses it until it
//~ expires (`<program> whoami` to check, `<program> logout` to clear). For unattended /
//~ machine use, skip login and set PIKKU_API_KEY (sent as x-api-key) instead.
//~
//~ TELL THE USER the binary name and the `login` line. A CLI nobody knows how to invoke
//~ has not been delivered.
import { wireCLI, pikkuCLICommand, pikkuCLIRender } from '#pikku/cli'
//~ Import the SAME functions the app already uses — a CLI command is just another
//~ transport in front of a pikkuSessionlessFunc. NEVER write CLI-only business
//~ logic here; if a command needs new behaviour, add a *.function.ts and import it.
import { listLots } from '../../functions/list-lots.function.js'
import { markInvoicePaid } from '../../functions/mark-invoice-paid.function.js'

//~ A renderer turns a command's OUTPUT into stdout text. The render generic MUST
//~ match that function's output-schema type — give each command a renderer for its
//~ own shape (reuse one only when the shapes match).
const renderLots = pikkuCLIRender<Array<{ id: string; title: string; status: string }>>(
  (_services, lots) => {
    for (const l of lots) console.log(`${l.id}\t${l.status}\t${l.title}`)
    console.log(`\n${lots.length} lot(s)`)
  },
)

const renderInvoice = pikkuCLIRender<{ id: string; paid: boolean }>((_services, inv) => {
  console.log(`invoice ${inv.id} -> ${inv.paid ? 'paid' : 'unpaid'}`)
})

//~ program = the CLI's name; each command wraps a func + declares its flags. Flags
//~ map to the func INPUT schema (camelCase); `short` is optional.
wireCLI({
  program: 'ops',
  commands: {
    lots: pikkuCLICommand({
      func: listLots,
      description: 'List lots, optionally by status',
      render: renderLots,
      options: {
        status: { description: 'draft | live | hammered | ...', short: 's' },
      },
    }),
    'mark-paid': pikkuCLICommand({
      func: markInvoicePaid,
      description: 'Mark an invoice paid by id',
      render: renderInvoice,
      options: {
        id: { description: 'invoice id' },
      },
    }),
  },
  render: renderLots,
})
