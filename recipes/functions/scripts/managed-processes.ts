import { spawn } from 'node:child_process'

export type ManagedProcess = {
  name: string
  child: ReturnType<typeof spawn>
  closed: boolean
}

export function startManagedProcess(
  managedProcesses: ManagedProcess[],
  name: string,
  command: string,
  args: string[],
  cwd: string,
  extraEnv: Record<string, string> = {}
) {
  const processInfo: ManagedProcess = {
    name,
    child: spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        ...extraEnv,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    }),
    closed: false,
  }

  processInfo.child.stdout.on('data', (chunk) => {
    process.stdout.write(`[${name}] ${chunk}`)
  })
  processInfo.child.stderr.on('data', (chunk) => {
    process.stderr.write(`[${name}] ${chunk}`)
  })
  processInfo.child.on('exit', (code, signal) => {
    if ((code && code !== 0) || signal) {
      process.stderr.write(
        `[${name}] exited with ${signal ? `signal ${signal}` : `code ${code}`}\n`
      )
    }
  })
  processInfo.child.on('close', () => {
    processInfo.closed = true
  })

  managedProcesses.push(processInfo)
  return processInfo
}

export async function shutdownManagedProcesses(
  managedProcesses: ManagedProcess[],
  gracePeriodMs = 2000
) {
  const processes = [...managedProcesses].reverse()
  managedProcesses.length = 0
  await Promise.all(
    processes.map((processInfo) =>
      shutdownManagedProcess(processInfo, gracePeriodMs)
    )
  )
}

async function shutdownManagedProcess(
  processInfo: ManagedProcess,
  gracePeriodMs: number
) {
  if (processInfo.closed) {
    return
  }

  const { child } = processInfo

  await new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(forceKillTimer)
      resolve()
    }

    const forceKillTimer = setTimeout(() => {
      killManagedProcess(processInfo, 'SIGKILL')
    }, gracePeriodMs)

    child.once('close', finish)
    killManagedProcess(processInfo, 'SIGTERM')
  })
}

function killManagedProcess(
  processInfo: ManagedProcess,
  signal: NodeJS.Signals
) {
  const { child } = processInfo

  if (!processInfo.closed && process.platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, signal)
      return
    } catch {}
  }

  if (!processInfo.closed) {
    child.kill(signal)
  }
}
