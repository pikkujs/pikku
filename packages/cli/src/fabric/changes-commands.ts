import {
  defineCLICommands,
  pikkuCLICommand,
} from '../../.pikku/cli/pikku-cli-types.gen.js'
import { next, renderNext } from '../functions/commands/next.js'
import {
  FabricChangesList,
  renderChangesList,
} from './functions/changes-list.function.js'
import {
  FabricChangesNext,
  renderChangesNext,
} from './functions/changes-next.function.js'
import {
  FabricChangesShow,
  renderChangesShow,
} from './functions/changes-show.function.js'
import {
  FabricChangesFile,
  renderChangesFile,
} from './functions/changes-file.function.js'
import {
  FabricChangesClaim,
  renderChangesClaim,
} from './functions/changes-claim.function.js'
import {
  FabricChangesAsk,
  renderChangesAsk,
} from './functions/changes-ask.function.js'
import {
  FabricChangesShot,
  renderChangesShot,
} from './functions/changes-shot.function.js'
import {
  FabricChangesReply,
  renderChangesReply,
} from './functions/changes-reply.function.js'
import {
  FabricChangesDone,
  renderChangesDone,
} from './functions/changes-done.function.js'
import {
  FabricChangesMerge,
  renderChangesMerge,
} from './functions/changes-merge.function.js'

export const changesCommands = defineCLICommands({
  list: pikkuCLICommand({
    func: FabricChangesList,
    render: renderChangesList,
    description:
      'Open changes for a project, grouped the way they will be worked',
    options: {
      projectId: {
        description:
          'Fabric project writes are registered with (defaults to the linked checkout)',
        short: 'p',
      },
      stageId: { description: 'Only changes filed on this stage' },
      route: {
        description: 'Only changes filed on this route, e.g. /checkout',
      },
      groupId: { description: 'Only changes in this group' },
      pickupOnly: {
        description: 'Skip items still held for the person who just filed them',
        default: false,
      },
      includeDone: {
        description: 'Also return done and dismissed items',
        default: false,
      },
      limit: {
        description: 'How many to return (default 50, max 200)',
        type: 'number',
      },
      apiUrl: { description: 'Override the fabric-api URL for this call' },
    },
  }),
  wait: pikkuCLICommand({
    func: FabricChangesNext,
    render: renderChangesNext,
    description:
      'Wait until there is work — an item past its grace window, or an answer to a question you asked — then print it and exit. Run it in the background instead of polling. Exits 0 with work, 2 on --timeout/--once with none, 3 when the session is refused',
    options: {
      projectId: {
        description:
          'Fabric project writes are registered with (defaults to the linked checkout)',
        short: 'p',
      },
      route: {
        description: 'Only changes filed on this route, e.g. /checkout',
      },
      claim: {
        description:
          'Claim what it finds as one group before returning, so no other harness takes it',
        default: false,
      },
      claimedBy: {
        description:
          'Who you are, e.g. claude-code — needed with --claim, and wakes you when someone answers a question you asked',
      },
      title: { description: 'What to call the group --claim forms' },
      leaseMinutes: {
        description: 'Lease for --claim (default 30)',
        type: 'number',
      },
      interval: {
        description: 'Seconds between checks (default 15, minimum 5)',
        type: 'number',
      },
      timeout: {
        description: 'Give up after this many seconds and exit 2',
        type: 'number',
      },
      once: {
        description: 'Check once without waiting; exit 2 if there is nothing',
        default: false,
      },
      apiUrl: { description: 'Override the fabric-api URL for this call' },
    },
  }),
  show: pikkuCLICommand({
    parameters: '[changeId]',
    func: FabricChangesShow,
    render: renderChangesShow,
    description:
      'One change with its thread, its circled elements and the build it was filed against. Takes 2, #2 or the uuid',
    options: {
      changeId: {
        description: 'The change to read — 2, #2 or its uuid',
      },
      apiUrl: { description: 'Override the fabric-api URL for this call' },
    },
  }),
  file: pikkuCLICommand({
    func: FabricChangesFile,
    render: renderChangesFile,
    description:
      'File an item from outside the panel — the words, without the screenshot the panel would have attached',
    options: {
      projectId: {
        description:
          'Fabric project writes are registered with (defaults to the linked checkout)',
        short: 'p',
      },
      stageId: {
        description: 'Stage to file against (defaults to the only stage)',
      },
      title: {
        description: 'The requirement, in one line',
        short: 't',
      },
      body: { description: 'The detail, if a line is not enough' },
      bodyFile: {
        description:
          'Read the body from a file — use this when it has newlines',
      },
      route: {
        description: 'The route it is about, e.g. /admin/rota',
      },
      locale: { description: 'Locale it was seen in, e.g. de' },
      apiUrl: { description: 'Override the fabric-api URL for this call' },
    },
  }),
  claim: pikkuCLICommand({
    func: FabricChangesClaim,
    render: renderChangesClaim,
    description:
      'Take a batch of items as one job under a lease. Naming items without a group creates the group',
    options: {
      projectId: {
        description: 'Project the items belong to',
        short: 'p',
      },
      groupId: {
        description: 'Claim an existing group instead of forming one',
      },
      changeIds: {
        description:
          'The items to take — #2, 2 or uuids — comma-separated or repeated',
        type: 'string[]',
      },
      title: { description: 'What to call the group being formed' },
      claimedBy: {
        description:
          'Who is taking it — shown in the panel while the lease is held',
      },
      leaseMinutes: {
        description:
          'How long to hold it before it returns to the queue (default 30)',
        type: 'number',
      },
      creates: {
        description:
          'Tables this changeset creates — comma-separated; implies --needs-plan',
        type: 'string[]',
      },
      alters: {
        description:
          'Tables this changeset alters — comma-separated; implies --needs-plan',
        type: 'string[]',
      },
      reads: {
        description:
          'Tables this changeset reads — it waits for whichever changeset creates them',
        type: 'string[]',
      },
      needsPlan: {
        description: 'Whether the changeset is planned before it is built',
        type: 'boolean',
      },
      worktree: {
        description:
          'Build it in its own checkout beside the repo, on changeset/<title>, so other changesets can run at the same time',
        type: 'boolean',
      },
      apiUrl: { description: 'Override the fabric-api URL for this call' },
    },
  }),
  ask: pikkuCLICommand({
    parameters: '[changeId]',
    func: FabricChangesAsk,
    render: renderChangesAsk,
    description:
      'Ask the person who filed an item what you need to know. The question is parked, not blocking',
    options: {
      changeId: { description: 'The item the question is about' },
      question: {
        description:
          'One decision, in the filer’s vocabulary. Name the choices with --option, not as “(a) … (b) …” inside this text',
        short: 'q',
      },
      option: {
        description:
          'A choice the filer can click, repeatable — e.g. --option "Reprice them" --option "Leave them". Without these they have to type an answer',
        type: 'string[]',
      },
      authorName: { description: 'Who is asking, e.g. claude-code' },
      apiUrl: { description: 'Override the fabric-api URL for this call' },
    },
  }),
  reply: pikkuCLICommand({
    func: FabricChangesReply,
    render: renderChangesReply,
    parameters: '[changeId]',
    description:
      'Say something on an item’s thread without asking (which parks it) or closing it (done --note) — e.g. why you are not doing it, or what it is blocked on',
    options: {
      changeId: { description: 'The item to reply on — 2, #2 or its uuid' },
      message: {
        description: 'What to say, in the filer’s vocabulary',
        short: 'm',
      },
      image: {
        description:
          'Path to a screenshot to attach as evidence, e.g. what you saw when you could not reproduce it',
      },
      imageLabel: {
        description: 'What to call the screenshot (default “screenshot”)',
      },
      contentType: {
        description:
          'image/png, image/jpeg or image/webp (inferred from --image)',
      },
      authorName: { description: 'Who is replying, e.g. claude-code' },
      apiUrl: { description: 'Override the fabric-api URL for this call' },
    },
  }),
  shot: pikkuCLICommand({
    parameters: '[changeId]',
    func: FabricChangesShot,
    render: renderChangesShot,
    description:
      'Attach a rendered option to an item’s thread. The panel turns a set of them into a pick-one',
    options: {
      changeId: { description: 'The item the options belong to' },
      label: {
        description:
          'What to call this variant in the picker, e.g. “Grouped totals”',
      },
      image: { description: 'Path to the image file to attach' },
      imageBase64: {
        description: 'The image itself, base64, instead of --image',
      },
      contentType: {
        description:
          'image/png, image/jpeg or image/webp (inferred from --image)',
      },
      kind: {
        description:
          'option (a variant to choose between) or evidence (something to look at)',
        default: 'option',
      },
      authorName: { description: 'Who rendered it, e.g. claude-code' },
      apiUrl: { description: 'Override the fabric-api URL for this call' },
    },
  }),
  merge: pikkuCLICommand({
    func: FabricChangesMerge,
    render: renderChangesMerge,
    description:
      'Merge a finished changeset into this branch as one --no-ff commit with a Changeset trailer',
    options: {
      projectId: {
        description: 'Project the changeset belongs to',
        short: 'p',
      },
      groupId: { description: 'The changeset to merge' },
      apiUrl: { description: 'Override the fabric-api URL for this call' },
    },
  }),
  done: pikkuCLICommand({
    parameters: '[changeId]',
    func: FabricChangesDone,
    render: renderChangesDone,
    description:
      'Tick an item off, recording the branch and commit that closed it so the panel can strike it through',
    options: {
      changeId: { description: 'The item that is done' },
      branch: {
        description: 'Branch the fix landed on (defaults to this checkout)',
      },
      headCommit: {
        description: 'Commit that closed it (defaults to this checkout)',
      },
      note: {
        description: 'What was done, for whoever reads the thread later',
      },
      authorName: { description: 'Who did it, e.g. claude-code' },
      apiUrl: { description: 'Override the fabric-api URL for this call' },
    },
  }),
  next: pikkuCLICommand({
    func: next,
    render: renderNext,
    description:
      'Decide what should run next — the agent, its skill and its work — from the state of the project',
    options: {
      prompt: {
        description:
          'A request for this project; it is turned into changes first',
      },
      exec: {
        description:
          'Launch the chosen agent in this harness (pi or claude) instead of printing it',
      },
      harnessArg: {
        description: 'Passed through to the harness, e.g. -p — repeatable',
        type: 'string[]',
      },
      loop: {
        description:
          'With --exec, route again after each agent until there is nothing to do',
        type: 'boolean',
      },
      parallel: {
        description:
          'Route an agent even while another changeset is running; each works its own in a worktree',
        type: 'boolean',
      },
      push: {
        description: 'Push after merging finished changesets',
        type: 'boolean',
      },
    },
  }),
})
