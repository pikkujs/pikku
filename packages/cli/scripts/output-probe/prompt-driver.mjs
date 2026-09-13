// Drives the real promptConfirm helper the way `fabric deploy apply` does.
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import chalk from 'chalk'
const logo = `${chalk.cyan('◇◆')} ${chalk.bold('pikku')} ${chalk.cyan.bold('::')}`
console.log(logo)
console.log('')
const rl = createInterface({ input: stdin, output: stdout })
const answer = (await rl.question('Deploy develop @ a1a6b669? [y/N] ')).trim().toLowerCase()
rl.close()
console.log(answer === 'y' ? 'deploying…' : 'aborted')
