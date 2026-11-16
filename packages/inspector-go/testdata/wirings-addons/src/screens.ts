import { definePlugin } from '@pikku/core/addon'

/** Values that are words, shared through a const and spread into each copy that meets them. */
const VALUES = {
  why_timeout: { $: 'admin_why_timeout' },
}

const PROBLEM_COPY = {
  ...VALUES,
  failed: {
    name: 'admin_problem_failed__name',
    lead: 'admin_problem_failed__lead',
    compact: 'admin_problem_failed__compact',
    primary: { label: 'admin_problem_failed__fix', draft: 'admin_problem_failed__draft' },
  },
  fig_last: { label: 'admin_fig_last__label', value: 'admin_fig_last__none' },
}

const ROW_COPY = {
  ...VALUES,
  row: { name: 'admin_problem_failed__name', status: { text: 'admin_row__status' }, tags: { 0: 'admin_row__tag' } },
}

/** The widgets, shared through a const the manifest names. */
const WIDGETS = {
  'release-chart': {
    title: 'admin_release_chart__title',
    description: 'admin_release_chart__description',
    states: ['full', 'tile'],
    actions: ['open'],
    skins: ['desk'],
    component: () => import('./widgets/release-chart.js'),
  },
  'no-description': {
    title: 'admin_release_chart__title',
    description: 'admin_no_description__description',
    states: ['full'],
    actions: [],
    component: () => import('./widgets/release-chart.js'),
  },
  'bad-state': {
    title: 'admin_release_chart__title',
    description: 'admin_release_chart__description',
    states: ['huge' as any],
    actions: [],
    component: () => import('./widgets/release-chart.js'),
  },
}

export const screens = definePlugin(({
  title: 'admin__title',
  screens: [
    {
      path: '/users',
      title: 'admin_users__title',
      scope: 'team',
      nav: { area: 'team', icon: 'users', order: 10, badge: 'nightly' },
      scopes: ['admin'],
      component: () => import('./screens/users.js'),
    },
    {
      path: '/docs',
      title: 'admin_docs__title',
      scope: 'project',
      replaces: true,
      needsApp: true,
      app: 'docs-app',
    },
    {
      path: '/welcome',
      title: 'admin_welcome__title',
      scope: 'studio',
      layout: 'bare',
      nav: { area: 'rail', icon: 'sparkles', order: -1 },
      app: 'welcome-app',
    },
    {
      path: '/inbox',
      title: 'admin_inbox__title',
      scope: 'project',
      nav: {
        area: 'project',
        icon: 'inbox',
        order: 20,
        badge: 'noSuchFunction',
      },
      app: 'inbox-app',
    },
    { path: '/docs', title: 'admin_docs__title', scope: 'team', app: 'again' },
    {
      path: '/bad',
      title: 'admin_docs__title',
      scope: 'team',
      component: (() => null) as any,
    },
    {
      path: '/both',
      title: 'admin_docs__title',
      scope: 'team',
      app: 'x',
      component: () => import('./screens/users.js'),
    },
    {
      path: '/scopes',
      title: 'admin_docs__title',
      scope: 'team',
      scopes: [1 as any],
      app: 'y',
    },
    {
      path: '/scope',
      title: 'admin_docs__title',
      scope: 'org' as any,
      app: 'y',
    },
    {
      path: '/layout',
      title: 'admin_docs__title',
      scope: 'team',
      layout: LAYOUT,
      app: 'y',
    },
    {
      path: '/nav',
      title: 'admin_docs__title',
      scope: 'team',
      nav: { area: 'team', icon: ICON, order: 1 },
      app: 'y',
    },
    {
      path: '/navarea',
      title: 'admin_docs__title',
      scope: 'team',
      nav: { area: 'side' as any, icon: 'x', order: 1 },
      app: 'y',
    },
    {
      path: '/missing-key',
      title: 'admin_missing__title',
      scope: 'team',
      app: 'y',
    },
    {
      path: '/assist',
      title: 'admin_docs__title',
      scope: 'team',
      agent: 'helper',
      app: 'y',
    },
    {
      path: '/assist-ghost',
      title: 'admin_docs__title',
      scope: 'team',
      agent: 'ghost',
      app: 'y',
    },
    {
      path: '/assist-bad-name',
      title: 'admin_docs__title',
      scope: 'team',
      agent: 'Bad_Name',
      app: 'y',
    },
    {
      path: '/assist-studio',
      title: 'admin_docs__title',
      scope: 'team',
      agent: 'studio:knowledge',
      app: 'y',
    },
    {
      path: '/assist-studio-bad',
      title: 'admin_docs__title',
      scope: 'team',
      agent: 'studio:Bad',
      app: 'y',
    },
    {
      path: '/assist-empty',
      title: 'admin_docs__title',
      scope: 'team',
      agent: '',
      app: 'y',
    },
    {
      path: '/assist-no-default-chat',
      title: 'admin_docs__title',
      scope: 'team',
      agent: 'studio:knowledge',
      defaultChat: false,
      app: 'y',
    },
    {
      path: '/no-chat',
      title: 'admin_docs__title',
      scope: 'team',
      defaultChat: false,
      app: 'y',
    },
    {
      path: '/default-chat-variable',
      title: 'admin_docs__title',
      scope: 'team',
      defaultChat: SHOW_CHAT,
      app: 'y',
    },
    { title: 'No path', app: 'z' } as any,
    'not-an-object' as any,
  ],
  widgets: WIDGETS,
  things: {
    problem: {
      label: 'admin_problem__label',
      source: 'nightly',
      copy: PROBLEM_COPY,
      parts: [
        { widget: 'release-chart', from: 'releases', span: 'wide' },
        { widget: 'trend', from: 'trend', compact: 'hide' },
        { widget: 'rows', from: 'where', copy: { ...ROW_COPY, where: { title: 'admin_where__title' } } },
      ],
      related: ['problem'],
      actions: {
        forget: {
          run: 'admin:triggerSourceForget',
          label: 'admin_forget__label',
          destructive: true,
          confirm: 'admin_forget__confirm',
        },
        retry: { run: 'nightly', label: 'admin_retry__label' },
        health: { run: 'go:/health-next', label: 'admin_health__title' },
      },
      alwaysFull: true,
      measure: 'narrow',
    },
  },
  arrangedScreens: {
    health: {
      path: '/health-next',
      title: 'admin_health__title',
      about: 'admin_health__about',
      scope: 'project',
      source: 'nightly',
      slots: [
        {
          widget: 'verdict',
          from: 'verdict',
          span: 'full',
          copy: {
            wrong: { headline: 'admin_verdict_wrong__headline' },
            fine: { headline: 'admin_verdict_fine__headline' },
          },
        },
        { widget: 'release-chart', from: 'releases' },
      ],
      shows: ['problem'],
      lanes: 3,
      chat: 'collapse',
      scoped: true,
      actions: { verify: { run: 'console:runVerify', label: 'admin_retry__label' } },
      redirect: { new: 'start', gone: '/home' },
      poll: { fast: 3000, slow: 45000 },
    },
    start: {
      path: '/start-next',
      title: 'admin_health__title',
      scope: 'project',
      source: 'console:getAllMeta',
      slots: [],
      poll: 60000,
    },
    badRpc: {
      path: '/bad-rpc',
      title: 'admin_docs__title',
      scope: 'team',
      source: 'Console::all',
      slots: [],
    },
    badActions: {
      path: '/bad-actions',
      title: 'admin_docs__title',
      scope: 'team',
      source: 'nightly',
      slots: [],
      actions: {
        wipe: { run: 'admin:wipe', label: 'admin_docs__title', destructive: true },
        away: { run: 'go:health-next', label: 'admin_docs__title' },
      },
      poll: 0,
    },
    again: {
      path: '/users',
      title: 'admin_docs__title',
      scope: 'team',
      source: 'nightly',
      slots: [],
    },
    lanes: {
      path: '/lanes',
      title: 'admin_docs__title',
      scope: 'team',
      source: 'nightly',
      slots: [],
      lanes: 9,
    },
    elsewhere: {
      path: '/elsewhere',
      title: 'admin_docs__title',
      scope: 'team',
      source: 'nightly',
      slots: [{ widget: 'rows', from: 'rows', copy: { ...ELSEWHERE } }],
    },
    component: {
      path: '/arranged-component',
      title: 'admin_docs__title',
      scope: 'team',
      source: 'nightly',
      slots: [],
      component: () => import('./screens/users.js'),
    } as any,
  },
}) as const)

declare const LAYOUT: 'bare'
declare const ICON: string
declare const SHOW_CHAT: boolean
declare const ELSEWHERE: Record<string, Record<string, string>>
