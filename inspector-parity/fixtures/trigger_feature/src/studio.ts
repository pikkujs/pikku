import { definePlugin } from '@pikku/core'

definePlugin({
  title: 'plugin_title',
  screens: [
    { path: '/home', title: 'screen_title', scope: 'team', nav: { area: 'rail', icon: 'home', order: -2, badge: 'missingFn' }, component: () => import('./Home.js'), agent: 'helper', replaces: true, scopes: ['a'] },
    { path: '/home', title: 'other_key', scope: 'project', app: 'web', layout: 'bare', defaultChat: false, agent: 'studio:chat' },
    { path: '/bad', title: 'x', scope: 'nowhere', component: () => import('./B.js') },
    { path: '/both', title: 'x', scope: 'studio', component: () => import('./B.js'), app: 'z' },
    { path: '/agent', title: 'screen_title', scope: 'studio', app: 'web', agent: 'Bad_Name' },
    { path: '/noagent', title: 'screen_title', scope: 'studio', app: 'web', agent: 'ghost' },
    notAnObject,
  ],
})
declare const notAnObject: any
