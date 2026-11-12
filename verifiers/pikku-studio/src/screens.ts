// The generated definePlugin, typed against this
// addon's functions and message keys.
import { definePlugin } from '#pikku/addon/screens'

export default definePlugin({
  title: 'studio_verifier__title',
  screens: [
    {
      path: '/studio-verifier',
      title: 'studio_verifier_inbox__title',
      scope: 'project',
      nav: {
        area: 'project',
        icon: 'inbox',
        order: 10,
        badge: 'pendingCount',
      },
      needsApp: true,
      scopes: ['studio-verifier:read'],
      agent: 'helper',
      defaultChat: false,
      component: () => import('./screens/Inbox.js'),
    },
    {
      path: '/studio-verifier/settings',
      title: 'studio_verifier_settings__title',
      scope: 'team',
      nav: { area: 'team', icon: 'settings', order: 20 },
      layout: 'bare',
      replaces: true,
      component: () => import('./screens/Settings.js'),
    },
    {
      path: '/studio-verifier/console',
      title: 'studio_verifier_console__title',
      scope: 'studio',
      app: 'console',
    },
  ],
  widgets: {
    mini: {
      title: 'studio_verifier_mini__title',
      description: 'studio_verifier_mini__description',
      states: ['tile', 'chip'],
      actions: ['open'],
      component: () => import('./widgets/Mini.js'),
    },
  },
  things: {
    meta: {
      label: 'studio_verifier_meta__label',
      source: 'console:getAllMeta',
      copy: {
        any: {
          name: 'studio_verifier_meta__name',
          compact: 'studio_verifier_meta__compact',
        },
      },
      parts: [{ widget: 'mini', from: 'counts' }],
      actions: {
        forget: {
          run: 'admin:flagPrune',
          label: 'studio_verifier_forget__label',
          destructive: true,
          confirm: 'studio_verifier_forget__confirm',
        },
      },
    },
  },
  arrangedScreens: {
    health: {
      path: '/studio-verifier/health-next',
      title: 'studio_verifier_health__title',
      scope: 'project',
      source: 'healthScreen',
      slots: [
        {
          widget: 'verdict',
          from: 'verdict',
          span: 'full',
          copy: {
            wrong: { headline: 'studio_verifier_verdict_wrong__headline' },
            fine: { headline: 'studio_verifier_verdict_fine__headline' },
          },
        },
        { widget: 'mini', from: 'pending', compact: 'hide' },
      ],
      shows: ['meta'],
      poll: { fast: 3000, slow: 45000 },
    },
  },
})
