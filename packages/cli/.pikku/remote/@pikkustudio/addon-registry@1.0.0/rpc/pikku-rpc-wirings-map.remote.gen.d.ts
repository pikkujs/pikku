/**
 * This provides the structure needed for typescript to be aware of RPCs and their return types
 */



declare namespace __PikkuCustomTypes {
/**
 * Custom types shared by every generated typed map.
 */



export type GetOpenApiInput = {
    name: string;
    version?: string | undefined;
}
export type GetOpenApiOutput = {
    name: string;
    version: string;
    latestVersion?: string | undefined;
    provider: string;
    service: string | null;
    title: string;
    description: string;
    openapiVer: string;
    swaggerUrl: string;
    swaggerYamlUrl: string | null;
    logo: string | null;
    categories: string[];
    tags: string[];
    added: string;
    updated: string;
    preferred: boolean;
    securitySchemes?: string[] | undefined;
    servers?: string[] | undefined;
    totalOperations?: number | undefined;
    http?: {
        get: number;
        post: number;
        put: number;
        patch: number;
        delete: number;
        head: number;
        options: number;
    } | undefined;
    contentTypes?: string[] | undefined;
    authTypes?: string[] | undefined;
    resources?: number | undefined;
    tools?: number | undefined;
    accessVerified?: boolean | undefined;
    accessStatus?: ("auth_required" | "error" | "offline" | "public" | "unknown") | undefined;
    accessVerifiedAt?: string | undefined;
    accessError?: (string | null) | undefined;
    authType?: (string | null) | undefined;
    authLocation?: (string | null) | undefined;
    authParamName?: (string | null) | undefined;
    authHeaderPrefix?: (string | null) | undefined;
    tokenAcquisition?: (string | null) | undefined;
    perUser?: (boolean | null) | undefined;
    apiStatus?: (string | null) | undefined;
    pricingModel?: (string | null) | undefined;
    freeTier?: (boolean | null) | undefined;
    deprecated?: (boolean | null) | undefined;
    pagination?: (string | null) | undefined;
    dataFormats?: string[] | undefined;
    enriched?: boolean | undefined;
    enrichedAt?: string | undefined;
    enrichConfidence?: (string | null) | undefined;
    enrichSource?: (string | null) | undefined;
    enrichment?: {
        [key: string]: unknown;
    } | undefined;
    codegen?: {
        addon?: string | undefined;
        credential?: ("apikey" | "bearer" | "oauth2") | undefined;
        authType?: string | undefined;
        command?: string | undefined;
        functions?: string[] | undefined;
        functionCount?: number | undefined;
        declarations?: {
            kind: "secret" | "variable";
            id: string;
        }[] | undefined;
    } | undefined;
    codegenAt?: string | undefined;
} | null
export type GetPackageDownloadInput = {
    id: string;
}
export type GetPackageDownloadOutput = {
    url: string;
    expiresInSeconds: number;
}
export type GetPackageIconInput = {
    id: string;
}
export type GetPackageIconOutput = string | null
export type GetPackageInput = {
    id: string;
}
export type GetPackageOutput = {
    id: string;
    name: string;
    displayName: string;
    version: string;
    description: string;
    author: string;
    repository?: string | undefined;
    license?: string | undefined;
    readme?: string | undefined;
    icon?: string | undefined;
    publishedAt: string;
    updatedAt: string;
    publisher: {
        type: "org" | "user";
        id: string;
        name: string;
    } | null;
    tags: string[];
    categories: string[];
    functions: {
        [key: string]: unknown;
    };
    agents: {
        [key: string]: unknown;
    };
    secrets: {
        [key: string]: unknown;
    };
    credentials?: {
        [key: string]: unknown;
    } | undefined;
    variables: {
        [key: string]: unknown;
    };
    httpRoutes: {
        [key: string]: unknown;
    };
    channels: {
        [key: string]: unknown;
    };
    cli: {
        [key: string]: unknown;
    };
    mcp: {
        [key: string]: unknown;
    } | null;
    schemas: {
        [key: string]: unknown;
    };
} | null
export type ListOpenApiCategoriesOutput = {
    [key: string]: number;
}
export type ListOpenApiProvidersOutput = {
    provider: string;
    apiCount: number;
}[]
export type ListOpenApisInput = {
    provider?: string | undefined;
    category?: string | undefined;
    query?: string | undefined;
    accessStatus?: string | undefined;
    cursor?: string | undefined;
    offset?: string | undefined;
    limit?: string | undefined;
}
export type ListOpenApisOutput = {
    apis: {
        name: string;
        version: string;
        latestVersion?: string | undefined;
        provider: string;
        service: string | null;
        title: string;
        description: string;
        openapiVer: string;
        swaggerUrl: string;
        swaggerYamlUrl: string | null;
        logo: string | null;
        categories: string[];
        tags: string[];
        added: string;
        updated: string;
        preferred: boolean;
        securitySchemes?: string[] | undefined;
        servers?: string[] | undefined;
        totalOperations?: number | undefined;
        http?: {
            get: number;
            post: number;
            put: number;
            patch: number;
            delete: number;
            head: number;
            options: number;
        } | undefined;
        contentTypes?: string[] | undefined;
        authTypes?: string[] | undefined;
        resources?: number | undefined;
        tools?: number | undefined;
        accessVerified?: boolean | undefined;
        accessStatus?: ("auth_required" | "error" | "offline" | "public" | "unknown") | undefined;
        accessVerifiedAt?: string | undefined;
        accessError?: (string | null) | undefined;
        authType?: (string | null) | undefined;
        authLocation?: (string | null) | undefined;
        authParamName?: (string | null) | undefined;
        authHeaderPrefix?: (string | null) | undefined;
        tokenAcquisition?: (string | null) | undefined;
        perUser?: (boolean | null) | undefined;
        apiStatus?: (string | null) | undefined;
        pricingModel?: (string | null) | undefined;
        freeTier?: (boolean | null) | undefined;
        deprecated?: (boolean | null) | undefined;
        pagination?: (string | null) | undefined;
        dataFormats?: string[] | undefined;
        enriched?: boolean | undefined;
        enrichedAt?: string | undefined;
        enrichConfidence?: (string | null) | undefined;
        enrichSource?: (string | null) | undefined;
        enrichment?: {
            [key: string]: unknown;
        } | undefined;
        codegen?: {
            addon?: string | undefined;
            credential?: ("apikey" | "bearer" | "oauth2") | undefined;
            authType?: string | undefined;
            command?: string | undefined;
            functions?: string[] | undefined;
            functionCount?: number | undefined;
            declarations?: {
                kind: "secret" | "variable";
                id: string;
            }[] | undefined;
        } | undefined;
        codegenAt?: string | undefined;
    }[];
    total: number;
    nextCursor: number | null;
}
export type ListPackageCategoriesOutput = {
    [key: string]: number;
}
export type ListPackagesInput = {
    category?: string | undefined;
    tag?: string | undefined;
    query?: string | undefined;
    sort?: string | undefined;
    cursor?: string | undefined;
    limit?: string | undefined;
    /** 'true' narrows to first-party @pikku/addon-* packages. */
    official?: string | undefined;
    /** Comma-separated package names — the gallery's "Installed" filter. */
    names?: string | undefined;
}
export type ListPackagesOutput = {
    packages: {
        id: string;
        name: string;
        displayName: string;
        version: string;
        description: string;
        author: string;
        icon?: string | undefined;
        publishedAt: string;
        updatedAt: string;
        publisher: {
            type: "org" | "user";
            id: string;
            name: string;
        } | null;
        tags: string[];
        categories: string[];
        functions: {
            [key: string]: {};
        };
        agents: {
            [key: string]: {};
        };
    }[];
    total: number;
    nextCursor: number | null;
}
export type PublishPackageInput = {
    artifactKey: string;
    visibility?: ("org" | "public") | undefined;
}
export type PublishPackageOutput = {
    id: string;
    name: string;
    displayName: string;
    version: string;
    description: string;
    author: string;
    repository?: string | undefined;
    license?: string | undefined;
    readme?: string | undefined;
    icon?: string | undefined;
    publishedAt: string;
    updatedAt: string;
    publisher: {
        type: "org" | "user";
        id: string;
        name: string;
    } | null;
    tags: string[];
    categories: string[];
    functions: {
        [key: string]: unknown;
    };
    agents: {
        [key: string]: unknown;
    };
    secrets: {
        [key: string]: unknown;
    };
    credentials?: {
        [key: string]: unknown;
    } | undefined;
    variables: {
        [key: string]: unknown;
    };
    httpRoutes: {
        [key: string]: unknown;
    };
    channels: {
        [key: string]: unknown;
    };
    cli: {
        [key: string]: unknown;
    };
    mcp: {
        [key: string]: unknown;
    } | null;
    schemas: {
        [key: string]: unknown;
    };
} | {
    kind: "sdk";
    name: string;
    version: string;
    integrity: string;
    visibility: "org" | "public";
}
export type RequestPublishUrlInput = {
    packageName: string;
    version: string;
    kind?: ("package" | "sdk") | undefined;
}
export type RequestPublishUrlOutput = {
    uploadUrl: string;
    artifactKey: string;
    expiresInSeconds: number;
}
export type ResolveSdkInput = {
    name: string;
    range: string;
}
export type ResolveSdkOutput = {
    version: string;
    integrity: string;
    url: string;
}
export type SearchPackagesInput = {
    query: string;
}
export type SearchPackagesOutput = {
    id: string;
    name: string;
    displayName: string;
    version: string;
    description: string;
    author: string;
    repository?: string | undefined;
    license?: string | undefined;
    readme?: string | undefined;
    icon?: string | undefined;
    publishedAt: string;
    updatedAt: string;
    publisher: {
        type: "org" | "user";
        id: string;
        name: string;
    } | null;
    tags: string[];
    categories: string[];
    functions: {
        [key: string]: unknown;
    };
    agents: {
        [key: string]: unknown;
    };
    secrets: {
        [key: string]: unknown;
    };
    credentials?: {
        [key: string]: unknown;
    } | undefined;
    variables: {
        [key: string]: unknown;
    };
    httpRoutes: {
        [key: string]: unknown;
    };
    channels: {
        [key: string]: unknown;
    };
    cli: {
        [key: string]: unknown;
    };
    mcp: {
        [key: string]: unknown;
    } | null;
    schemas: {
        [key: string]: unknown;
    };
}[]
}
export type GetOpenApiInput = __PikkuCustomTypes.GetOpenApiInput
export type GetOpenApiOutput = __PikkuCustomTypes.GetOpenApiOutput
export type GetPackageDownloadInput = __PikkuCustomTypes.GetPackageDownloadInput
export type GetPackageDownloadOutput = __PikkuCustomTypes.GetPackageDownloadOutput
export type GetPackageIconInput = __PikkuCustomTypes.GetPackageIconInput
export type GetPackageIconOutput = __PikkuCustomTypes.GetPackageIconOutput
export type GetPackageInput = __PikkuCustomTypes.GetPackageInput
export type GetPackageOutput = __PikkuCustomTypes.GetPackageOutput
export type ListOpenApiCategoriesOutput = __PikkuCustomTypes.ListOpenApiCategoriesOutput
export type ListOpenApiProvidersOutput = __PikkuCustomTypes.ListOpenApiProvidersOutput
export type ListOpenApisInput = __PikkuCustomTypes.ListOpenApisInput
export type ListOpenApisOutput = __PikkuCustomTypes.ListOpenApisOutput
export type ListPackageCategoriesOutput = __PikkuCustomTypes.ListPackageCategoriesOutput
export type ListPackagesInput = __PikkuCustomTypes.ListPackagesInput
export type ListPackagesOutput = __PikkuCustomTypes.ListPackagesOutput
export type PublishPackageInput = __PikkuCustomTypes.PublishPackageInput
export type PublishPackageOutput = __PikkuCustomTypes.PublishPackageOutput
export type RequestPublishUrlInput = __PikkuCustomTypes.RequestPublishUrlInput
export type RequestPublishUrlOutput = __PikkuCustomTypes.RequestPublishUrlOutput
export type ResolveSdkInput = __PikkuCustomTypes.ResolveSdkInput
export type ResolveSdkOutput = __PikkuCustomTypes.ResolveSdkOutput
export type SearchPackagesInput = __PikkuCustomTypes.SearchPackagesInput
export type SearchPackagesOutput = __PikkuCustomTypes.SearchPackagesOutput

interface RPCHandler<I, O> {
    input: I;
    output: O;
}

export type RPCMap = {
  readonly 'getOpenApi': RPCHandler<GetOpenApiInput, GetOpenApiOutput>,
  readonly 'getPackageDownload': RPCHandler<GetPackageDownloadInput, GetPackageDownloadOutput>,
  readonly 'getPackageIcon': RPCHandler<GetPackageIconInput, GetPackageIconOutput>,
  readonly 'getPackage': RPCHandler<GetPackageInput, GetPackageOutput>,
  readonly 'listOpenApiCategories': RPCHandler<null, ListOpenApiCategoriesOutput>,
  readonly 'listOpenApiProviders': RPCHandler<null, ListOpenApiProvidersOutput>,
  readonly 'listOpenApis': RPCHandler<ListOpenApisInput, ListOpenApisOutput>,
  readonly 'listPackageCategories': RPCHandler<null, ListPackageCategoriesOutput>,
  readonly 'listPackages': RPCHandler<ListPackagesInput, ListPackagesOutput>,
  readonly 'publishPackage': RPCHandler<PublishPackageInput, PublishPackageOutput>,
  readonly 'requestPublishUrl': RPCHandler<RequestPublishUrlInput, RequestPublishUrlOutput>,
  readonly 'resolveSdk': RPCHandler<ResolveSdkInput, ResolveSdkOutput>,
  readonly 'searchPackages': RPCHandler<SearchPackagesInput, SearchPackagesOutput>,
};



// No addon packages, use RPCMap directly
export type FlattenedRPCMap = RPCMap

type IsAny<T> = 0 extends (1 & T) ? true : false
type IsVoidishInput<T> = IsAny<T> extends true
  ? false
  : [T] extends [void | null | undefined]
    ? true
    : false


export type RPCInvoke = <Name extends keyof FlattenedRPCMap>(
  ...args: IsVoidishInput<FlattenedRPCMap[Name]['input']> extends true
    ? [name: Name]
    : [name: Name, data: FlattenedRPCMap[Name]['input']]
) => Promise<FlattenedRPCMap[Name]['output']>

export type RPCMesh = <Name extends keyof FlattenedRPCMap>(
  ...args: IsVoidishInput<FlattenedRPCMap[Name]['input']> extends true
    ? [name: Name]
    : [name: Name, data: FlattenedRPCMap[Name]['input']]
) => Promise<FlattenedRPCMap[Name]['output']>

import type { FlattenedWorkflowMap } from '../workflow/pikku-workflow-map.gen.d.js'

import type { AgentMap } from '../agent/pikku-agent-map.gen.d.js'


type FlattenedAgentMap = AgentMap


import type { PikkuRPC } from '@pikku/core/rpc'
import type { AgentInput } from '@pikku/core/agent'

export type TypedStartWorkflow = <Name extends keyof FlattenedWorkflowMap>(
  name: Name,
  input: FlattenedWorkflowMap[Name]['input'],
  options?: { startNode?: string }
) => Promise<{ runId: string }>

export type TypedRunWorkflow = <Name extends keyof FlattenedWorkflowMap>(
  name: Name,
  input: FlattenedWorkflowMap[Name]['input']
) => Promise<FlattenedWorkflowMap[Name]['output']>

export type TypedWorkflowStatus = (
  workflowName: string,
  runId: string
) => Promise<{ id: string; status: 'running' | 'suspended' | 'completed' | 'failed' | 'cancelled' | 'compensating' | 'compensated' | 'compensation_failed'; output?: unknown; error?: { message?: string } }>

type TypedAgentRun = [keyof FlattenedAgentMap] extends [never]
  ? (name: string, input: AgentInput) => Promise<any>
  : <Name extends keyof FlattenedAgentMap>(
      name: Name,
      input: AgentInput
    ) => Promise<{ runId: string; result: FlattenedAgentMap[Name]['output']; usage: { inputTokens: number; outputTokens: number } }>

type TypedAgentStream = [keyof FlattenedAgentMap] extends [never]
  ? (name: string, input: AgentInput, options?: { requiresToolApproval?: 'all' | 'explicit' | false }) => Promise<void>
  : <Name extends keyof FlattenedAgentMap>(
      name: Name,
      input: AgentInput,
      options?: { requiresToolApproval?: 'all' | 'explicit' | false }
    ) => Promise<void>

export type TypedPikkuRPC = PikkuRPC<RPCInvoke, RPCMesh, TypedStartWorkflow, TypedAgentRun, TypedAgentStream>
  