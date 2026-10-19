/**
 * Workflow type map with input/output types for each workflow
 */





interface WorkflowHandler<I, O> {
    input: I;
    output: O;
}

interface GraphNodeHandler<I> {
    input: I;
}

export type WorkflowMap = {
};

export type GraphsMap = {
};

export type FlattenedWorkflowMap = WorkflowMap


export type WorkflowClient<Name extends keyof FlattenedWorkflowMap> = {
  start: (input: FlattenedWorkflowMap[Name]['input']) => Promise<{ runId: string }>;
  getRun: <output extends keyof FlattenedWorkflowMap[Name]>(runId: string) => Promise<FlattenedWorkflowMap[Name][output]>;
  cancelRun: (runId: string) => Promise<boolean>;
}

export type TypedWorkflowClients = {
  [Name in keyof FlattenedWorkflowMap]: WorkflowClient<Name>;
}
