import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'
import { milestoneReport } from '@pikku/builder'


export const ListProjectsInput = z.object({})

export const listProjects = pikkuSessionlessFunc({
  description: 'Every project Studio knows, local and in Fabric.',
  input: ListProjectsInput,
  func: async ({ studio }) => ({ projects: await studio.projects.list() }),
})

export const AddProjectInput = z.object({ path: z.string() })

export const addProject = pikkuSessionlessFunc({
  description: 'Add a project folder that is already on this machine.',
  input: AddProjectInput,
  func: async ({ studio }, { path }) => studio.projects.add(path),
})

export const CreateProjectInput = z.object({ name: z.string(), idea: z.string().optional() })

export const createProject = pikkuSessionlessFunc({
  description: 'Create a new project from an idea.',
  input: CreateProjectInput,
  func: async ({ studio }, input) => studio.projects.create(input),
})

export const CloneProjectInput = z.object({ fabricProjectId: z.string() })

export const cloneProject = pikkuSessionlessFunc({
  description: 'Bring a Fabric project onto this machine.',
  input: CloneProjectInput,
  func: async ({ studio }, { fabricProjectId }) => studio.projects.clone(fabricProjectId),
})

export const RemoveProjectInput = z.object({ key: z.string() })

export const removeProject = pikkuSessionlessFunc({
  description: 'Forget a project. Its folder is left alone.',
  input: RemoveProjectInput,
  func: async ({ studio }, { key }) => studio.projects.remove(key),
})

export const OpenProjectInput = z.object({ key: z.string() })

export const openProject = pikkuSessionlessFunc({
  description: 'Start a project and return where it is served.',
  input: OpenProjectInput,
  func: async ({ studio }, { key }) => {
    await studio.projects.open(key)
    return { serverUrl: `/p/${key}` }
  },
})

export const UpdateDatabaseInput = z.object({ key: z.string() })

export const updateDatabase = pikkuSessionlessFunc({
  description: "Bring a project's database up to date, then start it.",
  input: UpdateDatabaseInput,
  func: async ({ studio }, { key }) => {
    await studio.projects.updateDatabase(key)
    await studio.projects.open(key)
    return { serverUrl: `/p/${key}` }
  },
})

export const CloseProjectInput = z.object({ key: z.string() })

export const closeProject = pikkuSessionlessFunc({
  description: 'Stop a running project.',
  input: CloseProjectInput,
  func: async ({ studio }, { key }) => {
    studio.projects.close(key)
    return null
  },
})

export const CloseAllProjectsInput = z.object({})

export const closeAllProjects = pikkuSessionlessFunc({
  description: 'Stop every running project.',
  input: CloseAllProjectsInput,
  func: async ({ studio }) => {
    studio.projects.closeAll()
    return null
  },
})

export const ProjectAppsInput = z.object({ key: z.string() })

export const projectApps = pikkuSessionlessFunc({
  description: "A project's frontends and where each is served.",
  input: ProjectAppsInput,
  func: async ({ studio }, { key }) => studio.projects.projectApps(key),
})

export const ProjectLogsInput = z.object({ key: z.string() })

export const projectLogs = pikkuSessionlessFunc({
  description: "A running project's recent output.",
  input: ProjectLogsInput,
  func: async ({ studio }, { key }) => studio.projects.logs(key),
})

export const KeepStatusInput = z.object({ key: z.string() })

export const keepStatus = pikkuSessionlessFunc({
  description: 'Whether a project has work that is not kept yet.',
  input: KeepStatusInput,
  func: async ({ studio }, { key }) => studio.projects.keepStatus(key),
})

export const KeepChangesInput = z.object({ key: z.string() })

export const keepChanges = pikkuSessionlessFunc({
  description: "Keep a project's work.",
  input: KeepChangesInput,
  func: async ({ studio }, { key }) => studio.projects.keepChanges(key),
})

export const MilestonesInput = z.object({ key: z.string() })

export const MilestonesOutput = z.object({ milestones: z.array(z.record(z.string(), z.unknown())) })

export const milestones = pikkuSessionlessFunc({
  description: "A project's milestones and how far each has got.",
  input: MilestonesInput,
  output: MilestonesOutput,
  func: async ({ studio }, { key }) => ({ milestones: await milestoneReport(await studio.projects.projectDir(key)) }),
})
