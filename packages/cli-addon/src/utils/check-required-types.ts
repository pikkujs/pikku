import type { FilesAndMethodsErrors } from '@pikku/inspector'

export type RequiredTypes = Partial<{
  config: boolean
  wireServiceType: boolean
  singletonServicesType: boolean
  userSessionType: boolean
  singletonServicesFactory: boolean
  wireServicesFactory: boolean
}>

export const checkRequiredTypes = (
  errors: FilesAndMethodsErrors,
  requires: RequiredTypes = {}
): void => {
  // Filter out errors that are about missing Types when we have the corresponding Factory
  // e.g., if we have a CreateConfig factory, we don't need a CoreConfig type
  const errorMessages = Array.from(errors.keys())
  const hasCreateConfigFactory = errorMessages.every(
    (msg) => !msg.includes('No CreateConfig found')
  )

  // Only throw if there are errors AND we require those types
  const hasRequiredErrors = errorMessages.some((message) => {
    // Skip CoreConfig type errors if we have a CreateConfig factory
    if (
      requires.config &&
      message.includes('No CoreConfig found') &&
      hasCreateConfigFactory
    ) {
      return false
    }
    if (requires.config && message.includes('CoreConfig')) return true
    if (requires.wireServiceType && message.includes('CoreServices'))
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
    if (requires.wireServicesFactory && message.includes('CreateWireServices'))
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
