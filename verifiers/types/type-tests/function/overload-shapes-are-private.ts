/**
 * Type constraint: overload-parameter shapes stay out of the generated surface
 *
 * Types such as `PikkuFunctionConfigWithSchema` exist only to name the `config`
 * argument inside an overload signature. Exporting them makes them part of what
 * an app can import from `#pikku`, which is a compatibility promise nobody asked
 * for. The channel, cli, http, mcp, queue and scheduler templates already keep
 * theirs internal; these assert the function, trigger and workflow templates do
 * the same.
 *
 * Each name is re-exported below so `noUnusedLocals` cannot hand the directive
 * an error of its own — the only error left for it to consume is the missing
 * member, so re-exporting any of these names fails the suite as an unused
 * `@ts-expect-error`.
 */

// @ts-expect-error - PikkuPermissionConfig is an overload parameter, not API
import type { PikkuPermissionConfig } from '#pikku'
// @ts-expect-error - PikkuAuthConfig is an overload parameter, not API
import type { PikkuAuthConfig } from '#pikku'
// @ts-expect-error - PikkuMiddlewareConfig is an overload parameter, not API
import type { PikkuMiddlewareConfig } from '#pikku'
// @ts-expect-error - PikkuFunctionSessionlessConfig is an overload parameter, not API
import type { PikkuFunctionSessionlessConfig } from '#pikku'
// @ts-expect-error - PikkuFunctionConfigWithSchema is an overload parameter, not API
import type { PikkuFunctionConfigWithSchema } from '#pikku'
// @ts-expect-error - PikkuFunctionSessionlessConfigWithSchema is an overload parameter, not API
import type { PikkuFunctionSessionlessConfigWithSchema } from '#pikku'
// @ts-expect-error - PikkuTriggerFunctionConfig is an overload parameter, not API
import type { PikkuTriggerFunctionConfig } from '#pikku'
// @ts-expect-error - PikkuTriggerFunctionConfigWithSchema is an overload parameter, not API
import type { PikkuTriggerFunctionConfigWithSchema } from '#pikku'
// @ts-expect-error - TriggerWiring is an overload parameter, not API
import type { TriggerWiring } from '#pikku'

// @ts-expect-error - PikkuWorkflowConfigWithSchema is an overload parameter, not API
import type { PikkuWorkflowConfigWithSchema } from '#pikku/workflow/pikku-workflow-types.gen.js'
// @ts-expect-error - PikkuScenarioConfigWithSchema is an overload parameter, not API
import type { PikkuScenarioConfigWithSchema } from '#pikku/workflow/pikku-workflow-types.gen.js'
// @ts-expect-error - PikkuFeatureConfig is an overload parameter, not API
import type { PikkuFeatureConfig } from '#pikku/workflow/pikku-workflow-types.gen.js'
// @ts-expect-error - PikkuScenarioStepConfig is an overload parameter, not API
import type { PikkuScenarioStepConfig } from '#pikku/workflow/pikku-workflow-types.gen.js'
// @ts-expect-error - PikkuScenarioStepConfigWithSchema is an overload parameter, not API
import type { PikkuScenarioStepConfigWithSchema } from '#pikku/workflow/pikku-workflow-types.gen.js'
// @ts-expect-error - PikkuSubjectScenarioStepConfig is an overload parameter, not API
import type { PikkuSubjectScenarioStepConfig } from '#pikku/workflow/pikku-workflow-types.gen.js'
// @ts-expect-error - PikkuSubjectScenarioStepConfigWithSchema is an overload parameter, not API
import type { PikkuSubjectScenarioStepConfigWithSchema } from '#pikku/workflow/pikku-workflow-types.gen.js'

export type _PermissionConfig = PikkuPermissionConfig
export type _AuthConfig = PikkuAuthConfig
export type _MiddlewareConfig = PikkuMiddlewareConfig
export type _SessionlessConfig = PikkuFunctionSessionlessConfig
export type _FunctionConfigWithSchema = PikkuFunctionConfigWithSchema
export type _SessionlessConfigWithSchema = PikkuFunctionSessionlessConfigWithSchema
export type _TriggerFunctionConfig = PikkuTriggerFunctionConfig
export type _TriggerFunctionConfigWithSchema = PikkuTriggerFunctionConfigWithSchema
export type _TriggerWiring = TriggerWiring
export type _WorkflowConfigWithSchema = PikkuWorkflowConfigWithSchema
export type _ScenarioConfigWithSchema = PikkuScenarioConfigWithSchema
export type _FeatureConfig = PikkuFeatureConfig
export type _ScenarioStepConfig = PikkuScenarioStepConfig
export type _ScenarioStepConfigWithSchema = PikkuScenarioStepConfigWithSchema
export type _SubjectScenarioStepConfig = PikkuSubjectScenarioStepConfig
export type _SubjectScenarioStepConfigWithSchema = PikkuSubjectScenarioStepConfigWithSchema

/**
 * The factories the shapes belong to stay exported — this is about the argument
 * type being unnameable, not about the API being gone.
 */
import {
  pikkuFunc,
  pikkuSessionlessFunc,
  pikkuVoidFunc,
  pikkuPermission,
  pikkuMiddleware,
  pikkuTriggerFunc,
} from '#pikku'

void pikkuFunc
void pikkuSessionlessFunc
void pikkuVoidFunc
void pikkuPermission
void pikkuMiddleware
void pikkuTriggerFunc
