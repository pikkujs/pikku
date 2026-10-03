import { defineHTTPRoutes, wireHTTPRoutes } from '#pikku/http'
import { account, aiOptions, setAi, changeAi, useLocally, startSignIn, pollSignIn, signOut } from './functions/studio/account.function.js'
import { listProjects, addProject, createProject, cloneProject, removeProject, openProject, updateDatabase, closeProject, closeAllProjects, projectApps, projectLogs, keepStatus, keepChanges, milestones } from './functions/studio/projects.function.js'
import { builderState, builderPrompt, builderCancel, builderClear } from './functions/studio/builder.function.js'
import { publishOptions, publishToFabric, publishStatus } from './functions/studio/publish.function.js'
import { projectProxy, projectShot } from './functions/studio/proxy.function.js'

const studioRoutes = defineHTTPRoutes({
  auth: false,
  tags: ['studio'],
  routes: {
    account: { method: 'post', route: '/studio/account', func: account },
    aiOptions: { method: 'post', route: '/studio/aiOptions', func: aiOptions },
    setAi: { method: 'post', route: '/studio/setAi', func: setAi },
    changeAi: { method: 'post', route: '/studio/changeAi', func: changeAi },
    useLocally: { method: 'post', route: '/studio/useLocally', func: useLocally },
    startSignIn: { method: 'post', route: '/studio/startSignIn', func: startSignIn },
    pollSignIn: { method: 'post', route: '/studio/pollSignIn', func: pollSignIn },
    signOut: { method: 'post', route: '/studio/signOut', func: signOut },
    listProjects: { method: 'post', route: '/studio/listProjects', func: listProjects },
    addProject: { method: 'post', route: '/studio/addProject', func: addProject },
    createProject: { method: 'post', route: '/studio/createProject', func: createProject },
    cloneProject: { method: 'post', route: '/studio/cloneProject', func: cloneProject },
    removeProject: { method: 'post', route: '/studio/removeProject', func: removeProject },
    openProject: { method: 'post', route: '/studio/openProject', func: openProject },
    updateDatabase: { method: 'post', route: '/studio/updateDatabase', func: updateDatabase },
    closeProject: { method: 'post', route: '/studio/closeProject', func: closeProject },
    closeAllProjects: { method: 'post', route: '/studio/closeAllProjects', func: closeAllProjects },
    projectApps: { method: 'post', route: '/studio/projectApps', func: projectApps },
    projectLogs: { method: 'post', route: '/studio/projectLogs', func: projectLogs },
    keepStatus: { method: 'post', route: '/studio/keepStatus', func: keepStatus },
    keepChanges: { method: 'post', route: '/studio/keepChanges', func: keepChanges },
    milestones: { method: 'post', route: '/studio/milestones', func: milestones },
    builderState: { method: 'post', route: '/studio/builderState', func: builderState },
    builderPrompt: { method: 'post', route: '/studio/builderPrompt', func: builderPrompt },
    builderCancel: { method: 'post', route: '/studio/builderCancel', func: builderCancel },
    builderClear: { method: 'post', route: '/studio/builderClear', func: builderClear },
    publishOptions: { method: 'post', route: '/studio/publishOptions', func: publishOptions },
    publishToFabric: { method: 'post', route: '/studio/publishToFabric', func: publishToFabric },
    publishStatus: { method: 'post', route: '/studio/publishStatus', func: publishStatus },
    shot: { method: 'get', route: '/studio/shot/:key/*path', func: projectShot },
    proxyGet: { method: 'get', route: '/p/:key{/*rest}', func: projectProxy },
    proxyPost: { method: 'post', route: '/p/:key{/*rest}', func: projectProxy },
    proxyPut: { method: 'put', route: '/p/:key{/*rest}', func: projectProxy },
    proxyPatch: { method: 'patch', route: '/p/:key{/*rest}', func: projectProxy },
    proxyDelete: { method: 'delete', route: '/p/:key{/*rest}', func: projectProxy },
    proxyHead: { method: 'head', route: '/p/:key{/*rest}', func: projectProxy },
    proxyOptions: { method: 'options', route: '/p/:key{/*rest}', func: projectProxy },
  },
})

wireHTTPRoutes({ routes: { studio: studioRoutes } })
