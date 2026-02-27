import { exec } from 'child_process'

export function runPikkuCLI(cwd: string, args: string[]): Promise<string> {
  const command = `npx pikku ${args.join(' ')}`
  return new Promise((resolve, reject) => {
    exec(command, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message))
        return
      }
      resolve(stdout.trim())
    })
  })
}
