import { pikkuStudio } from '@pikku/core/addon'

export default pikkuStudio({
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
})
