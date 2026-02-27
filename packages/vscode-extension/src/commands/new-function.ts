import * as vscode from 'vscode'

const FUNCTION_TYPES = [
  { label: 'pikkuFunc', description: 'Standard function with session' },
  {
    label: 'pikkuSessionlessFunc',
    description: 'Function without session requirement',
  },
  { label: 'pikkuVoidFunc', description: 'Fire-and-forget function' },
]

export async function newFunction(): Promise<void> {
  const funcType = await vscode.window.showQuickPick(FUNCTION_TYPES, {
    placeHolder: 'Select function type',
  })
  if (!funcType) return

  const name = await vscode.window.showInputBox({
    prompt: 'Function name (e.g. getBooks)',
    validateInput: (value) => {
      if (!value) return 'Name is required'
      if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(value))
        return 'Must be a valid identifier'
      return undefined
    },
  })
  if (!name) return

  const inputName = capitalize(name) + 'Input'
  const outputName = capitalize(name) + 'Output'

  const isVoid = funcType.label === 'pikkuVoidFunc'
  const isSessionless = funcType.label === 'pikkuSessionlessFunc'

  let content: string

  if (isVoid) {
    content = `import { ${funcType.label} } from '@pikku/core'

export type ${inputName} = {
  // TODO: define input
}

export const ${name} = ${funcType.label}<${inputName}>(
  async ({ services }, data) => {
    // TODO: implement
  }
)
`
  } else if (isSessionless) {
    content = `import { ${funcType.label} } from '@pikku/core'

export type ${inputName} = {
  // TODO: define input
}

export type ${outputName} = {
  // TODO: define output
}

export const ${name} = ${funcType.label}<${inputName}, ${outputName}>(
  async ({ services }, data) => {
    // TODO: implement
    return {} as ${outputName}
  }
)
`
  } else {
    content = `import { ${funcType.label} } from '@pikku/core'

export type ${inputName} = {
  // TODO: define input
}

export type ${outputName} = {
  // TODO: define output
}

export const ${name} = ${funcType.label}<${inputName}, ${outputName}>(
  async ({ session, services }, data) => {
    // TODO: implement
    return {} as ${outputName}
  }
)
`
  }

  const doc = await vscode.workspace.openTextDocument({
    content,
    language: 'typescript',
  })
  await vscode.window.showTextDocument(doc)
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
