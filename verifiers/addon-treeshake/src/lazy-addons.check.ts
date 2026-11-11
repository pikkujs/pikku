import { pathToFileURL } from 'node:url'
import { pikkuState } from '@pikku/core/state'

const addonFunctions = () =>
  pikkuState('@pikku/templates-function-addon', 'function', 'functions').size

const bootstrap = (await import(pathToFileURL(process.argv[2]!).href)) as {
  loadAddons: () => Promise<unknown>
}
const atStartup = addonFunctions()
await bootstrap.loadAddons()
console.log(JSON.stringify({ atStartup, afterLoadAddons: addonFunctions() }))
