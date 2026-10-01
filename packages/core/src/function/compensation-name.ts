export const COMPENSATION_STEP_SUFFIX = ':compensate'

export const compensationStepName = (stepName: string): string =>
  `${stepName}${COMPENSATION_STEP_SUFFIX}`

export const isCompensationStepName = (stepName: string): boolean =>
  stepName.endsWith(COMPENSATION_STEP_SUFFIX)

export const forwardStepName = (stepName: string): string =>
  isCompensationStepName(stepName)
    ? stepName.slice(0, -COMPENSATION_STEP_SUFFIX.length)
    : stepName
