import { FilesAndMethodsErrors } from '@pikku/inspector'

export type RequiredTypes = Partial<{
  config: boolean
  sessionServiceType: boolean
  singletonServicesType: boolean
  userSessionType: boolean
  singletonServicesFactory: boolean
  sessionServicesFactory: boolean
}>

export const checkRequiredTypes = (
  errors: FilesAndMethodsErrors,
  requires: RequiredTypes = {}
): void => {
  // Only throw if there are errors AND we require those types
  const hasRequiredErrors = Array.from(errors.keys()).some((message) => {
    if (requires.config && message.includes('CoreConfig')) return true
    if (requires.sessionServiceType && message.includes('CoreServices'))
      return true
    if (
      requires.singletonServicesType &&
      message.includes('CoreSingletonServices')
    )
      return true
    if (requires.userSessionType && message.includes('CoreUserSession'))
      return true
    if (
      requires.singletonServicesFactory &&
      message.includes('CreateSingletonServices')
    )
      return true
    if (
      requires.sessionServicesFactory &&
      message.includes('CreateSessionServices')
    )
      return true
    return false
  })

  if (hasRequiredErrors) {
    const result: string[] = ['Found errors:']
    errors.forEach((filesAndMethods, message) => {
      result.push(`- ${message}`)
      filesAndMethods.forEach((methods, file) => {
        result.push(
          `\t* methods: ${methods.map(({ variable, type }) => `${variable}: ${type}`).join(', ')}`
        )
      })
    })
    throw new Error(result.join('\n'))
  }
}
