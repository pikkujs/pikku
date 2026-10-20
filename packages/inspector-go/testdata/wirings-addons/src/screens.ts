import { pikkuStudio } from '@pikku/core/addon'

export const screens = pikkuStudio({
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
    { title: 'No path', app: 'z' } as any,
    'not-an-object' as any,
  ],
})

declare const LAYOUT: 'bare'
declare const ICON: string
