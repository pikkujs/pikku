/**
 * Type-level tests for `definePlugin`: valid declarations compile and invalid
 * ones fail with `@ts-expect-error`. Checked by `tsc -p tsconfig.type-tests.json`.
 */
import { definePlugin } from './define-plugin.js'
import type {
  DefinePlugin,
  StudioCardHead,
  StudioManifest,
  StudioSourceInput,
  StudioVariantData,
} from './define-plugin.js'

declare module './define-plugin.js' {
  interface WidgetRegistry {
    verdict: StudioVariantData<'wrong' | 'fine'>
    trend: { points: number[] }
  }
}

const component = () => Promise.resolve({ default: null as unknown })
const problemCopy = { name: 'p__name', compact: 'p__compact' } as const

// Today's declarations compile unchanged.
const _screensOnly: StudioManifest = definePlugin({
  title: 'inbox__title',
  screens: [
    {
      path: '/inbox',
      title: 'inbox_screen__title',
      scope: 'project',
      nav: { area: 'project', icon: 'inbox', order: 10, badge: 'unread' },
      scopes: ['inbox:read'],
      component,
    },
    { path: '/docs', title: 'docs__title', scope: 'studio', app: 'dist' },
  ],
})
void _screensOnly

definePlugin({
  title: 't',
  // @ts-expect-error a screen field that does not exist is still refused
  screens: [{ path: '/a', title: 't', scope: 'team', component, naav: 1 }],
})

// Own widgets and core widgets are accepted in a slot.
definePlugin({
  title: 't',
  screens: [],
  widgets: {
    'release-chart': {
      title: 'w__title',
      description: 'w__description',
      states: ['full', 'tile'],
      actions: ['open'],
      component,
    },
  },
  arrangedScreens: {
    health: {
      path: '/health-next',
      title: 'health__title',
      scope: 'project',
      source: 'healthScreen',
      slots: [
        { widget: 'verdict', from: 'verdict', span: 'full' },
        { widget: 'release-chart', from: 'releases', compact: 'hide' },
      ],
    },
  },
})

definePlugin({
  title: 't',
  screens: [],
  arrangedScreens: {
    health: {
      path: '/health-next',
      title: 'health__title',
      scope: 'project',
      source: 'healthScreen',
      // @ts-expect-error neither a core widget nor one of the addon's own
      slots: [{ widget: 'pie', from: 'verdict' }],
    },
  },
})

definePlugin({
  title: 't',
  screens: [],
  widgets: {
    // @ts-expect-error an own widget may not take a core widget's id
    verdict: {
      title: 'w__title',
      description: 'w__description',
      states: ['full'],
      actions: [],
      component,
    },
  },
})

// `related` and `shows` name the addon's own kinds only.
definePlugin({
  title: 't',
  screens: [],
  things: {
    problem: {
      label: 'problem__label',
      source: 'problemCard',
      copy: { failed: problemCopy },
      parts: [{ widget: 'trend', from: 'trend' }],
      related: ['function'],
    },
    function: {
      label: 'function__label',
      source: 'fnCard',
      copy: { slow: problemCopy },
      parts: [],
    },
  },
  arrangedScreens: {
    home: {
      path: '/home-next',
      title: 'home__title',
      scope: 'project',
      source: 'homeScreen',
      slots: [],
      shows: ['problem', 'function'],
    },
  },
})

definePlugin({
  title: 't',
  screens: [],
  things: {
    problem: {
      label: 'problem__label',
      source: 'problemCard',
      copy: { failed: problemCopy },
      parts: [],
      // @ts-expect-error 'release' is not a kind this addon declares
      related: ['release'],
    },
  },
})

definePlugin({
  title: 't',
  screens: [],
  things: {
    problem: {
      label: 'problem__label',
      source: 'problemCard',
      copy: { failed: problemCopy },
      parts: [],
    },
  },
  arrangedScreens: {
    home: {
      path: '/home-next',
      title: 'home__title',
      scope: 'project',
      source: 'homeScreen',
      slots: [],
      // @ts-expect-error 'deploy' is not a kind this addon declares
      shows: ['deploy'],
    },
  },
})

// Typed against the addon's functions and catalog, as `#pikku/screens` does.
type Fns = {
  readonly healthScreen: {
    input: StudioSourceInput
    output: {
      verdict: StudioVariantData<'wrong' | 'fine'>
      traffic: { points: number[] }
    }
  }
  readonly startScreen: {
    input: StudioSourceInput
    output: { variant: 'new' | 'started'; steps: { points: number[] } }
  }
  readonly problemCard: {
    input: StudioSourceInput
    output: {
      head: StudioCardHead<'failed' | 'slow'>
      trend: { points: number[] }
    }
  }
}
type Keys =
  | 'health__title'
  | 'problem__label'
  | 'verdict_wrong__headline'
  | 'verdict_fine__headline'
  | 'problem_failed__name'
  | 'problem_failed__compact'
  | 'problem_slow__name'
  | 'problem_slow__compact'
  | 'forget__label'
  | 'forget__confirm'
const typedDefinePlugin = definePlugin as DefinePlugin<Fns, Keys>

const failed = {
  name: 'problem_failed__name',
  compact: 'problem_failed__compact',
} as const
const slow = {
  name: 'problem_slow__name',
  compact: 'problem_slow__compact',
} as const

typedDefinePlugin({
  title: 't',
  screens: [],
  things: {
    problem: {
      label: 'problem__label',
      source: 'problemCard',
      copy: { failed, slow },
      parts: [{ widget: 'trend', from: 'trend' }],
    },
  },
  arrangedScreens: {
    health: {
      path: '/health-next',
      title: 'health__title',
      scope: 'project',
      source: 'healthScreen',
      slots: [
        {
          widget: 'verdict',
          from: 'verdict',
          copy: {
            wrong: { headline: 'verdict_wrong__headline' },
            fine: { headline: 'verdict_fine__headline' },
          },
        },
        { widget: 'trend', from: 'traffic' },
      ],
    },
  },
})

typedDefinePlugin({
  title: 't',
  screens: [],
  arrangedScreens: {
    health: {
      path: '/health-next',
      title: 'health__title',
      scope: 'project',
      source: 'healthScreen',
      // @ts-expect-error 'nope' is not a key of healthScreen's output
      slots: [{ widget: 'verdict', from: 'nope' }],
    },
  },
})

typedDefinePlugin({
  title: 't',
  screens: [],
  arrangedScreens: {
    health: {
      path: '/health-next',
      title: 'health__title',
      scope: 'project',
      // @ts-expect-error 'missing' is not a function of the addon
      source: 'missing',
      slots: [],
    },
  },
})

typedDefinePlugin({
  title: 't',
  screens: [],
  things: {
    problem: {
      label: 'problem__label',
      source: 'problemCard',
      copy: { failed, slow },
      // @ts-expect-error 'verdict' is not a key of problemCard's output
      parts: [{ widget: 'verdict', from: 'verdict' }],
    },
  },
})

typedDefinePlugin({
  title: 't',
  screens: [],
  things: {
    problem: {
      label: 'problem__label',
      source: 'problemCard',
      // @ts-expect-error the source can return 'slow', which has no wording
      copy: { failed },
      parts: [],
    },
  },
})

typedDefinePlugin({
  title: 't',
  screens: [],
  arrangedScreens: {
    health: {
      path: '/health-next',
      title: 'health__title',
      scope: 'project',
      source: 'healthScreen',
      slots: [
        {
          widget: 'verdict',
          from: 'verdict',
          // @ts-expect-error the verdict can be 'fine', which has no wording
          copy: { wrong: { headline: 'verdict_wrong__headline' } },
        },
      ],
    },
  },
})

typedDefinePlugin({
  title: 't',
  screens: [],
  arrangedScreens: {
    health: {
      path: '/health-next',
      title: 'health__title',
      scope: 'project',
      source: 'healthScreen',
      slots: [
        {
          widget: 'verdict',
          from: 'verdict',
          copy: {
            // @ts-expect-error copy names message keys of the catalog, never text
            wrong: { headline: 'A few things went wrong' },
            fine: { headline: 'verdict_fine__headline' },
          },
        },
      ],
    },
  },
})

typedDefinePlugin({
  title: 't',
  screens: [],
  things: {
    problem: {
      // @ts-expect-error a label is a message key of the catalog
      label: 'Problem',
      source: 'problemCard',
      copy: { failed, slow },
      parts: [],
    },
  },
})

// A source or an action may name a project RPC; its output is not checked.
typedDefinePlugin({
  title: 't',
  screens: [],
  things: {
    agent: {
      label: 'problem__label',
      source: 'console:getAgent',
      copy: { any: failed },
      parts: [{ widget: 'trend', from: 'anything' }],
      actions: {
        forget: {
          run: 'admin:forgetAgent',
          label: 'forget__label',
          destructive: true,
          confirm: 'forget__confirm',
        },
        retry: { run: 'problemCard', label: 'forget__label' },
      },
    },
  },
  arrangedScreens: {
    start: {
      path: '/start-next',
      title: 'health__title',
      scope: 'project',
      source: 'startScreen',
      slots: [{ widget: 'trend', from: 'steps' }],
      redirect: { started: 'health' },
      poll: { fast: 3000, slow: 45000 },
    },
    health: {
      path: '/health-next',
      title: 'health__title',
      scope: 'project',
      source: 'console:listAgents',
      slots: [],
      redirect: { gone: '/home' },
      poll: 60000,
    },
  },
})

typedDefinePlugin({
  title: 't',
  screens: [],
  things: {
    agent: {
      label: 'problem__label',
      source: 'problemCard',
      copy: { failed, slow },
      parts: [],
      actions: {
        // @ts-expect-error a destructive action needs a confirm
        forget: {
          run: 'admin:forgetAgent',
          label: 'forget__label',
          destructive: true,
        },
      },
    },
  },
})

typedDefinePlugin({
  title: 't',
  screens: [],
  things: {
    agent: {
      label: 'problem__label',
      source: 'problemCard',
      copy: { failed, slow },
      parts: [],
      // @ts-expect-error 'nope' is neither a function of the addon nor a project RPC
      actions: { retry: { run: 'nope', label: 'forget__label' } },
    },
  },
})

typedDefinePlugin({
  title: 't',
  screens: [],
  arrangedScreens: {
    start: {
      path: '/start-next',
      title: 'health__title',
      scope: 'project',
      source: 'startScreen',
      slots: [],
      // @ts-expect-error 'done' is not a variant startScreen returns
      redirect: { done: '/home' },
    },
  },
})

typedDefinePlugin({
  title: 't',
  screens: [],
  arrangedScreens: {
    start: {
      path: '/start-next',
      title: 'health__title',
      scope: 'project',
      source: 'startScreen',
      slots: [],
      // @ts-expect-error neither an arranged screen of the addon nor a path
      redirect: { new: 'getting-started' },
    },
  },
})

// A source returns a variant and raw values, never words.
const _head: StudioCardHead<'failed'> = {
  variant: 'failed',
  values: { count: 23, last: '2026-11-12T16:41:00Z', error: 'ECONNRESET' },
  tone: 'bad',
}
void _head

const _badHead: StudioCardHead<'failed'> = {
  // @ts-expect-error a variant the thing does not declare
  variant: 'exploded',
}
void _badHead

const _badValue: StudioCardHead<'failed'> = {
  variant: 'failed',
  // @ts-expect-error values are raw strings or numbers, formatted by the host
  values: { at: new Date() },
}
void _badValue
