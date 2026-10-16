import { defineScreens } from '@pikku/core/addon'

export const screens = defineScreens({
  title: 'Admin',
  icon: 'gear',
  screens: [
    {
      path: '/users',
      title: 'Users',
      nav: true,
      scopes: ['admin'],
      component: () => import('./screens/users.js'),
    },
    { path: '/docs', title: 'Docs', app: 'docs-app' },
    { path: '/bad', title: 'Bad', component: (() => null) as any },
    {
      path: '/both',
      title: 'Both',
      app: 'x',
      component: () => import('./screens/users.js'),
    },
    { path: '/scopes', title: 'Scopes', scopes: [1 as any], app: 'y' },
    { title: 'No path', app: 'z' } as any,
    'not-an-object' as any,
  ],
})
