import type { InspectorState, InspectorOptions } from '@pikku/inspector'
import { getFilesAndMethods } from '@pikku/inspector'

interface Meta {
  file: string
  variable: string
  type: string
  typePath: string
}

export type FilesAndMethods = {
  userSessionType: Meta
  wireServicesType: Meta
  singletonServicesType: Meta
  pikkuConfigFactory: Meta
  singletonServicesFactory: Meta
  wireServicesFactory: Meta
}

/**
 * @deprecated Use state.filesAndMethods from InspectorState instead
 */
export const getPikkuFilesAndMethods = async (
  state: InspectorState,
  options: InspectorOptions['types'] = {}
): Promise<FilesAndMethods> => {
  const { result: sharedResult, errors } = getFilesAndMethods(state, options)

  if (errors.size > 0) {
    const messages: string[] = ['Found errors:']
    errors.forEach((filesAndMethods, message) => {
      messages.push(`- ${message}`)
      filesAndMethods.forEach((methods) => {
        messages.push(
          `\t* methods: ${methods.map(({ variable, type }) => `${variable}: ${type}`).join(', ')}`
        )
      })
    })
    throw new Error(messages.join('\n'))
  }

  return {
    userSessionType: sharedResult.userSessionType as Meta,
    singletonServicesType: sharedResult.singletonServicesType as Meta,
    wireServicesType: sharedResult.wireServicesType as Meta,
    pikkuConfigFactory: sharedResult.pikkuConfigFactory as Meta,
    singletonServicesFactory: sharedResult.singletonServicesFactory as Meta,
    wireServicesFactory: sharedResult.wireServicesFactory as Meta,
  }
}
