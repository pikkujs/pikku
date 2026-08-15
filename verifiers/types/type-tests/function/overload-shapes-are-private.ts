/**
 * Type constraint: only types a user cannot derive stay in the generated surface
 *
 * A type earns its export in exactly one case: it is reachable from an exported
 * factory's return type, so declaration emit in the user's own module needs to
 * name it. Everything else is private — users reach types through
 * `ReturnType<typeof fn>` or `typeof myValue`, which keeps the factory the
 * single entry point and keeps the documented surface small.
 *
 * That leaves three kinds of name asserted private here:
 *   - overload-parameter shapes, which only name the `config` argument inside an
 *     overload signature (`PikkuFunctionConfigWithSchema` and friends);
 *   - generated id unions, which nothing derives and nothing consumed
 *     (`PersonaId`, `SecretId`, `VariableId`, `WorkflowNames`, …);
 *   - types referenced by nothing at all (`PikkuListFunction`, deleted outright).
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
// @ts-expect-error - PikkuAuth is an overload parameter, not API
import type { PikkuAuth } from '#pikku'
// @ts-expect-error - WiredAuthServices only supplies a generic default, not API
import type { WiredAuthServices } from '#pikku'
// @ts-expect-error - PikkuListFunction was referenced by nothing; pikkuListFunc is the API
import type { PikkuListFunction } from '#pikku'
// @ts-expect-error - PikkuTriggerFunctionConfigWithSchema is an overload parameter, not API
import type { PikkuTriggerFunctionConfigWithSchema } from '#pikku'
// @ts-expect-error - PikkuTriggerFunction is an overload parameter, not API
import type { PikkuTriggerFunction } from '#pikku'
/**
 * `PikkuTriggerFunctionConfig` is the declared return type of both
 * `pikkuTriggerFunc` overloads, which looks like it must stay exported for
 * declaration emit. It does not: TypeScript writes an alias-to-object-literal
 * structurally into the `.d.ts`, so a user's `export const t =
 * pikkuTriggerFunc(...)` names no type at all and TS2883 never fires. Verified
 * with `tsc --declaration --emitDeclarationOnly`, which is the only mode that
 * can surface TS2883 — `--noEmit` never does.
 */
// @ts-expect-error - PikkuTriggerFunctionConfig is inlined structurally, not API
import type { PikkuTriggerFunctionConfig } from '#pikku'
// @ts-expect-error - TriggerSource is the wireTriggerSource parameter, not API
import type { TriggerSource } from '#pikku'
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
// @ts-expect-error - WorkflowNames is a generated id union, not API
import type { WorkflowNames } from '#pikku/workflow/pikku-workflow-wirings.gen.js'

// @ts-expect-error - PersonaId is a generated id union, not API
import type { PersonaId } from '#pikku/scopes/pikku-personas.gen.js'
// @ts-expect-error - RunnablePersonaId is a generated id union, not API
import type { RunnablePersonaId } from '#pikku/scopes/pikku-personas.gen.js'
// @ts-expect-error - EnvironmentName is a generated id union, not API
import type { EnvironmentName } from '#pikku/scopes/pikku-personas.gen.js'
// @ts-expect-error - TypedPersona is an overload parameter, not API
import type { TypedPersona } from '#pikku/scopes/pikku-personas.gen.js'
// @ts-expect-error - SecretId is a generated id union, not API
import type { SecretId } from '#pikku/secrets/pikku-secrets.gen.js'
// @ts-expect-error - VariableId is a generated id union, not API
import type { VariableId } from '#pikku/variables/pikku-variables.gen.js'

/**
 * `defineScope`, `defineSystemRole`, `defineSecret` and `defineVariable` all
 * return `void`, so every type they were re-exported alongside was a parameter
 * shape or an internal metadata shape — nothing a user names and nothing
 * declaration emit can need.
 */
// @ts-expect-error - CoreSystemRoles is the defineSystemRole parameter, not API
import type { CoreSystemRoles } from '#pikku/scopes/pikku-scope-types.gen.js'
// @ts-expect-error - CoreScopes is the defineScope parameter, not API
import type { CoreScopes } from '#pikku/scopes/pikku-scope-types.gen.js'
// @ts-expect-error - SystemRoleDefinitionsMeta is console metadata, not API
import type { SystemRoleDefinitionsMeta } from '#pikku/scopes/pikku-scope-types.gen.js'

export type _PermissionConfig = PikkuPermissionConfig
export type _AuthConfig = PikkuAuthConfig
export type _MiddlewareConfig = PikkuMiddlewareConfig
export type _SessionlessConfig = PikkuFunctionSessionlessConfig
export type _FunctionConfigWithSchema = PikkuFunctionConfigWithSchema
export type _SessionlessConfigWithSchema =
  PikkuFunctionSessionlessConfigWithSchema
export type _Auth = PikkuAuth
export type _WiredAuthServices = WiredAuthServices
export type _ListFunction = PikkuListFunction
export type _TriggerFunctionConfigWithSchema =
  PikkuTriggerFunctionConfigWithSchema
export type _TriggerFunction = PikkuTriggerFunction
export type _TriggerFunctionConfig = PikkuTriggerFunctionConfig
export type _TriggerSource = TriggerSource
export type _TriggerWiring = TriggerWiring
export type _WorkflowConfigWithSchema = PikkuWorkflowConfigWithSchema
export type _ScenarioConfigWithSchema = PikkuScenarioConfigWithSchema
export type _FeatureConfig = PikkuFeatureConfig
export type _ScenarioStepConfig = PikkuScenarioStepConfig
export type _ScenarioStepConfigWithSchema = PikkuScenarioStepConfigWithSchema
export type _SubjectScenarioStepConfig = PikkuSubjectScenarioStepConfig
export type _SubjectScenarioStepConfigWithSchema =
  PikkuSubjectScenarioStepConfigWithSchema
export type _WorkflowNames = WorkflowNames
export type _PersonaId = PersonaId
export type _RunnablePersonaId = RunnablePersonaId
export type _EnvironmentName = EnvironmentName
export type _TypedPersona = TypedPersona
export type _SecretId = SecretId
export type _VariableId = VariableId
export type _CoreSystemRoles = CoreSystemRoles
export type _CoreScopes = CoreScopes
export type _SystemRoleDefinitionsMeta = SystemRoleDefinitionsMeta

/**
 * The factories the shapes belong to stay exported — this is about the argument
 * type being unnameable, not about the API being gone.
 */
import {
  pikkuFunc,
  pikkuSessionlessFunc,
  pikkuVoidFunc,
  pikkuListFunc,
  pikkuPermission,
  pikkuMiddleware,
  pikkuTriggerFunc,
} from '#pikku'

void pikkuFunc
void pikkuSessionlessFunc
void pikkuVoidFunc
void pikkuListFunc
void pikkuPermission
void pikkuMiddleware
void pikkuTriggerFunc

/**
 * `template` was re-exported as a value, but a graph never reaches for it by
 * name — the `input` callback is handed it as its second argument,
 * `(ref, template) => ...`, so the barrel export was only ever a second way to
 * get something you already have.
 */
// @ts-expect-error - template arrives as the input callback's second argument
import { template } from '#pikku/workflow/pikku-workflow-types.gen.js'

void template
