import { useEffect } from 'react'
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { Bell, FolderOpen, Home, Settings } from 'lucide-react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { m } from '@/i18n/messages'
import { Shell } from '@/layouts/Shell'
import { Rail, type RailItem } from '@/blocks/Rail'
import { SetupRail, type SetupStep } from '@/blocks/SetupRail'
import { WrenDock } from '@/blocks/WrenDock'
import { useAccount, useBuilderPrompt, useCreateProject, useProjects } from '@/hooks/useStudio'
import { useWrenNote } from '@/hooks/useWrenNote'
import { useRailCollapsed } from '@/hooks/useRailCollapsed'
import { AskWrenProvider, useAskWren } from '@/hooks/useAskWren'

export function AppShell() {
  return (
    <AskWrenProvider>
      <AppShellFrame />
    </AskWrenProvider>
  )
}

function AppShellFrame() {
  const { draft } = useAskWren()
  const { collapsed, toggle } = useRailCollapsed()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const account = useAccount()
  const projects = useProjects()
  const navigate = useNavigate()
  const prompt = useBuilderPrompt()
  const create = useCreateProject()
  const projectKey = pathname.match(/^\/app\/p\/([^/]+)/)?.[1] ?? null

  useEffect(() => {
    if (!account.data) return
    if (account.data.signIn === null && pathname !== '/app/sign-in') navigate({ to: '/app/sign-in' })
    else if (account.data.signIn !== null && account.data.ai === null && pathname === '/app') navigate({ to: '/app/choose-ai' })
  }, [account.data, pathname, navigate])

  const firstProject = pathname === '/app' && projects.isSuccess && projects.data.projects.length === 0
  const setupStep: SetupStep | null =
    pathname === '/app/sign-in' ? 0 : pathname === '/app/choose-ai' ? 1 : firstProject ? 2 : null

  const idle =
    setupStep === 0 ? m.signin__wren() : setupStep === 1 ? m.ai__wren() : setupStep === 2 ? m.newproject__wren() : m.shell__wren_idle()
  const note = useWrenNote(projectKey, idle)

  const send = (text: string) => {
    if (projectKey) prompt.mutate({ key: projectKey, message: text })
    else
      create.mutate(
        { name: text.slice(0, 48), idea: text },
        {
          onSuccess: (project) => {
            prompt.mutate({ key: project.key, message: text })
            navigate({ to: '/app/p/$key/plan', params: { key: project.key } })
          },
        },
      )
  }

  const items: RailItem[] = [
    { to: '/app', label: m.shell__home(), Icon: Home, active: pathname === '/app' },
    { to: '/app/projects', label: m.shell__projects(), Icon: FolderOpen, active: pathname === '/app/projects' },
    { to: '/app', label: m.shell__updates(), Icon: Bell, active: false },
    { to: '/app', label: m.shell__settings(), Icon: Settings, active: false },
  ]

  return (
    <TooltipProvider>
      <Shell
        collapsed={setupStep === null && collapsed}
        rail={
          setupStep === null ? (
            <Rail collapsed={collapsed} onToggle={toggle} items={items} recent={projects.data?.projects ?? []} />
          ) : (
            <SetupRail step={setupStep} />
          )
        }
        dock={<WrenDock key={draft} note={note} draft={draft} onSend={send} />}
      >
        <Outlet />
      </Shell>
    </TooltipProvider>
  )
}
