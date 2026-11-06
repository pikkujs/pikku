import {
  ForbiddenError,
  MissingServiceError,
  MissingSessionError,
} from '../../errors/errors.js'
import { addError } from '../../errors/error-handler.js'
import { applyDefaultsFromSchema, validateSchema } from '../../schema.js'
import type { Logger } from '../../services/logger.js'
import type { SchemaService } from '../../services/schema-service.js'
import type { CoreUserSession } from '../../types/core.types.js'
import { WorkflowNotFoundError } from './workflow-errors.js'
import { resolveWorkflowMeta } from './workflow-meta-resolver.js'
import type { WorkflowRun, WorkflowRunWire } from './workflow.types.js'

/** The caller is not the user who started this workflow run. Responds 403. */
export class WorkflowRunForbiddenError extends ForbiddenError {
  constructor() {
    super('Not authorized to access this workflow run')
  }
}
addError(WorkflowRunForbiddenError, {
  status: 403,
  message: 'Not authorized to access this workflow run.',
})

/**
 * A run started through a session records that session's user as its owner, and
 * only that user may read it. Who may *answer* a run's approval gates is the
 * gate's own declaration — see `approvers` on `workflow.approval()`.
 *
 * A run with no recorded owner — started by a trigger, a scheduler, or an
 * anonymous route — is refused: nobody can prove it is theirs, and a run id is
 * not a capability. Consoles and other internal readers do not use this check;
 * they gate themselves with their own scopes.
 */
export const assertWorkflowRunOwner = (
  wire: WorkflowRunWire | undefined,
  session: CoreUserSession | undefined
): void => {
  const owner = wire?.pikkuUserId
  if (!owner || !session?.userId || session.userId !== owner) {
    throw new WorkflowRunForbiddenError()
  }
}

/**
 * The read gate of a generated status route: the run must exist, belong to the
 * workflow named in the URL, and be owned by the caller. A missing run and a
 * foreign one are the same refusal, so a route cannot be used to probe run ids.
 */
export const assertWorkflowRunReadable = (
  run: Pick<WorkflowRun, 'workflow' | 'wire'> | null | undefined,
  workflowName: string,
  session: CoreUserSession | undefined
): void => {
  if (!run || run.workflow !== workflowName) {
    throw new WorkflowRunForbiddenError()
  }
  assertWorkflowRunOwner(run.wire, session)
}

/**
 * The approve gate of a generated route: only an `expose: true` workflow is
 * answerable, and the run must be one of its runs — otherwise exposing any one
 * workflow would open the gates of every other. An unknown workflow, a hidden
 * one and a run that is not its own all answer the same 404.
 *
 * Who may answer stays the gate's own policy, judged by `approveStep`.
 */
export const assertWorkflowRunAnswerable = (
  run: Pick<WorkflowRun, 'workflow'> | null | undefined,
  workflowName: string
): void => {
  if (
    resolveWorkflowMeta(workflowName)?.meta.expose !== true ||
    run?.workflow !== workflowName
  ) {
    throw new WorkflowNotFoundError(workflowName)
  }
}

/**
 * The start gate of a generated route, called by that route and never by
 * `rpc.startWorkflow`, which stays open to the application's own code.
 *
 * A signed-in caller reaches `expose: true` workflows; everything else is a 404
 * so hidden workflow names cannot be probed. An anonymous caller reaches only
 * those that also say `auth: false`, and gets the same 401 for every other name.
 * The input is then validated against the workflow's declared schema, and
 * returned with the schema's defaults applied.
 */
export const prepareWorkflowRouteStart = async (
  { logger, schema }: { logger: Logger; schema?: SchemaService },
  workflowName: string,
  input: unknown,
  access: 'session' | 'anonymous'
): Promise<unknown> => {
  const resolved = resolveWorkflowMeta(workflowName)
  if (access === 'anonymous') {
    if (resolved?.meta.expose !== true || resolved.meta.auth !== false) {
      throw new MissingSessionError()
    }
  } else if (resolved?.meta.expose !== true) {
    throw new WorkflowNotFoundError(workflowName)
  }
  const { inputSchemaName } = resolved.meta
  if (!inputSchemaName) {
    return input
  }
  if (!schema) {
    throw new MissingServiceError(
      `The schema service is required to validate the input of workflow '${workflowName}'`
    )
  }
  const data = applyDefaultsFromSchema(
    inputSchemaName,
    input,
    resolved.packageName
  )
  await validateSchema(
    logger,
    schema,
    inputSchemaName,
    data,
    resolved.packageName
  )
  return data
}
