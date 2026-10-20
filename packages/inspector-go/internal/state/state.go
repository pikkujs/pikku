// Package state is the Go form of SerializableInspectorState
// (packages/inspector/src/utils/serialize-inspector-state.ts).
//
// The State struct is laid out in the serializer's key order, so encoding it
// with jsjson gives the bytes `JSON.stringify(serializeInspectorState(s))`
// gives. JS Maps and Sets are Map / Set and encode as the serializer's arrays;
// plain objects are Record and keep JS key order. Fields tagged `json:"-"` are
// InspectorState members the serializer drops but a finalize pass still reads.
//
// Sections owned by visitor groups that are not ported yet have Raw elements:
// they serialize to their initial empty values, and decode/re-encode a TS
// state verbatim, so a Go finalize can be ported section by section on top.
package state

import (
	"github.com/pikkujs/pikku/packages/inspector-go/internal/jsjson"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/typesmap"
)

type State struct {
	RootDir                        string                  `json:"rootDir"`
	SingletonServicesTypeImportMap PathToNameAndType       `json:"singletonServicesTypeImportMap"`
	WireServicesTypeImportMap      PathToNameAndType       `json:"wireServicesTypeImportMap"`
	UserSessionTypeImportMap       PathToNameAndType       `json:"userSessionTypeImportMap"`
	ConfigTypeImportMap            PathToNameAndType       `json:"configTypeImportMap"`
	SingletonServicesFactories     PathToNameAndType       `json:"singletonServicesFactories"`
	WireServicesFactories          PathToNameAndType       `json:"wireServicesFactories"`
	WireServicesMeta               Map[Strings]            `json:"wireServicesMeta"`
	AddonRequiredParentServices    Strings                 `json:"addonRequiredParentServices"`
	AddonCreatedServices           Strings                 `json:"addonCreatedServices"`
	AddonServicesFactorySeen       bool                    `json:"addonServicesFactorySeen"`
	Analytics                      []*AnalyticsDeclaration `json:"analytics,omitempty"`
	OutgoingWebhooks               []*OutgoingWebhook      `json:"outgoingWebhooks,omitempty"`
	AddonServerlessIncompatible    Map[Strings]            `json:"addonServerlessIncompatible"`
	ConfigFactories                PathToNameAndType       `json:"configFactories"`
	ServerLifecycleFactories       PathToNameAndType       `json:"serverLifecycleFactories"`
	// InspectorFilesAndMethods: written by getFilesAndMethods (finalize).
	FilesAndMethods       Record[Raw]                    `json:"filesAndMethods"`
	FilesAndMethodsErrors Map[PathToNameAndType]         `json:"filesAndMethodsErrors"`
	SchemaLookup          Map[SchemaRef]                 `json:"schemaLookup"`
	Schemas               Record[Raw]                    `json:"schemas"`
	Functions             Functions                      `json:"functions"`
	HTTP                  HTTP                           `json:"http"`
	Channels              FilesFirst                     `json:"channels"`
	Gateways              MetaFiles                      `json:"gateways"`
	Triggers              Triggers                       `json:"triggers"`
	ScheduledTasks        MetaFiles                      `json:"scheduledTasks"`
	QueueWorkers          QueueWorkers                   `json:"queueWorkers"`
	Workflows             Workflows                      `json:"workflows"`
	RPC                   RPC                            `json:"rpc"`
	MCPEndpoints          MCPEndpoints                   `json:"mcpEndpoints"`
	Agents                Agents                         `json:"agents"`
	Scorers               Scorers                        `json:"scorers"`
	CLI                   CLI                            `json:"cli"`
	Nodes                 MetaFiles                      `json:"nodes"`
	Auth                  Auth                           `json:"auth"`
	Secrets               Secrets                        `json:"secrets"`
	SurfaceUsage          Record[*Record[*SurfaceUsage]] `json:"surfaceUsage"`
	Credentials           Definitions                    `json:"credentials"`
	Scopes                Scopes                         `json:"scopes"`
	SystemRoles           Definitions                    `json:"systemRoles"`
	FeatureFlags          Definitions                    `json:"featureFlags"`
	VirtualUsers          Definitions                    `json:"virtualUsers"`
	Variables             Definitions                    `json:"variables"`
	Manifest              Manifest                       `json:"manifest"`
	Middleware            Middleware                     `json:"middleware"`
	ChannelMiddleware     ChannelMiddleware              `json:"channelMiddleware"`
	AgentMiddleware       AgentMiddleware                `json:"agentMiddleware"`
	Permissions           Permissions                    `json:"permissions"`
	ServiceAggregation    ServiceAggregation             `json:"serviceAggregation"`
	// ServiceTypes is resolveServiceTypes' answer (analysis), read by finalize.
	ServiceTypes          *ServiceTypes                  `json:"serviceTypes,omitempty"`
	ResolvedIOTypes       Record[ResolvedIOType]         `json:"resolvedIOTypes"`
	MiddlewareGroupsMeta  MiddlewareGroupsMeta           `json:"middlewareGroupsMeta"`
	PermissionsGroupsMeta PermissionsGroupsMeta          `json:"permissionsGroupsMeta"`
	RequiredSchemas       Set                            `json:"requiredSchemas"`
	OpenAPISpec           Raw                            `json:"openAPISpec"`
	Diagnostics           List[InspectorDiagnostic]      `json:"diagnostics"`
	AddonFunctions        Record[*Record[*FunctionMeta]] `json:"addonFunctions"`
	// RemoteAddonFunctions is each versioned wireRemoteAddon's SDK metadata.
	RemoteAddonFunctions *Record[*Record[*FunctionMeta]] `json:"remoteAddonFunctions,omitempty"`
	Studio               Raw                             `json:"studio,omitempty"`
	AddonStudio          Raw                             `json:"addonStudio,omitempty"`
	AddonContributors    Raw                             `json:"addonContributors,omitempty"`
	ExportedContracts    ExportedContracts               `json:"exportedContracts"`

	// CoreTypeProperties replaces the live `typesLookup` entries for the core
	// interfaces (CoreConfig / CoreSingletonServices / CoreServices /
	// CoreUserSession extensions): interface name -> its property names in
	// `type.getProperties()` order. It is everything any reader outside the
	// analysis pass takes from those types (resolveCoreType(...).getProperties()
	// in the workflow command and in extractAllServices). Go-only: absent
	// (omitted) when no core interface was found, and not produced by the TS
	// serializer.
	CoreTypeProperties *Record[Strings] `json:"coreTypeProperties,omitempty"`

	// InspectorState members the serializer does not write.
	Stats *Stats `json:"-"`
}

type Functions struct {
	TypesMap             *typesmap.TypesMap            `json:"typesMap"`
	Meta                 Record[*FunctionMeta]         `json:"meta"`
	Files                Map[FileExport]               `json:"files"`
	ApprovalDescriptions Record[*MiddlewareDefinition] `json:"approvalDescriptions"`
	DynamicImportIds     Set                           `json:"dynamicImportIds"`
	// Disabled holds the functions declared with `disabled`, left out of
	// everything else; nil (and absent) when there are none.
	Disabled *Record[*DisabledFunctionMeta] `json:"disabled,omitempty"`
}

// DisabledFunctionMeta is a function declared with `disabled: true | 'reason'`.
type DisabledFunctionMeta struct {
	Name         string `json:"name"`
	SourceFile   string `json:"sourceFile"`
	ExportedName string `json:"exportedName,omitempty"`
	Reason       string `json:"reason,omitempty"`
}

type HTTP struct {
	MetaInputTypes  Map[MetaInputTypes]             `json:"metaInputTypes"`
	Meta            Record[*Record[*HTTPRouteMeta]] `json:"meta"`
	Files           Set                             `json:"files"`
	RouteMiddleware Map[*MiddlewareGroupMeta]       `json:"routeMiddleware"`
}

// HTTPMethods are the keys getInitialInspectorState gives http.meta.
var HTTPMethods = []string{"get", "post", "put", "delete", "head", "patch", "options"}

// FilesFirst is a `{ files, meta }` section (channels).
type FilesFirst struct {
	Files Set         `json:"files"`
	Meta  Record[Raw] `json:"meta"`
}

// MetaFiles is a `{ meta, files }` section.
type MetaFiles struct {
	Meta  Record[Raw] `json:"meta"`
	Files Set         `json:"files"`
}

type Triggers struct {
	Meta              Record[Raw]  `json:"meta"`
	SourceMeta        Record[Raw]  `json:"sourceMeta"`
	WebhookSourceMeta *Record[Raw] `json:"webhookSourceMeta,omitempty"`
	Files             Set          `json:"files"`
}

type QueueWorkers struct {
	Meta  Record[*QueueWorkerMeta] `json:"meta"`
	Files Set                      `json:"files"`
}

type Workflows struct {
	Meta             Record[Raw]     `json:"meta"`
	Files            Map[FileExport] `json:"files"`
	GraphMeta        Record[Raw]     `json:"graphMeta"`
	GraphFiles       Map[FileExport] `json:"graphFiles"`
	FeatureFiles     Map[Raw]        `json:"featureFiles"`
	InvokedWorkflows Set             `json:"invokedWorkflows"`
}

type RPC struct {
	InternalMeta           Record[string]  `json:"internalMeta"`
	InternalFiles          Map[FileExport] `json:"internalFiles"`
	ExposedMeta            Record[string]  `json:"exposedMeta"`
	ExposedFiles           Map[FileExport] `json:"exposedFiles"`
	RemoteMeta             Record[string]  `json:"remoteMeta"`
	RemoteFiles            Map[FileExport] `json:"remoteFiles"`
	InvokedFunctions       Set             `json:"invokedFunctions"`
	InvokedFunctionsByFile Map[*Set]       `json:"invokedFunctionsByFile"`
	UsedAddons             Set             `json:"usedAddons"`
	WireAddonDeclarations  Map[Raw]        `json:"wireAddonDeclarations"`
	WireAddonFiles         Set             `json:"wireAddonFiles"`
}

type MCPEndpoints struct {
	ResourcesMeta Record[*MCPResourceMeta] `json:"resourcesMeta"`
	ToolsMeta     Record[*MCPToolMeta]     `json:"toolsMeta"`
	PromptsMeta   Record[*MCPPromptMeta]   `json:"promptsMeta"`
	Files         Set                      `json:"files"`
	Surfaces      *Record[string]          `json:"surfaces,omitempty"`
}

// Agents follows the serializer's literal, which writes agentsMeta, files,
// invokedAgentsByFile in that order.
type Agents struct {
	AgentsMeta          Record[*AgentMeta] `json:"agentsMeta"`
	Files               Map[FileExport]    `json:"files"`
	InvokedAgentsByFile Map[*Set]          `json:"invokedAgentsByFile"`
}

type Scorers struct {
	ScorersMeta Record[*ScorerMeta] `json:"scorersMeta"`
	Files       Map[FileExport]     `json:"files"`
}

type CLIMeta struct {
	Programs  Record[Raw] `json:"programs"`
	Renderers Record[Raw] `json:"renderers"`
}

type CLI struct {
	Meta  CLIMeta `json:"meta"`
	Files Set     `json:"files"`
}

type Auth struct {
	Providers  Strings         `json:"providers"`
	Plugins    Strings         `json:"plugins"`
	Files      Set             `json:"files"`
	Definition *AuthDefinition `json:"definition"`
}

type Secrets struct {
	Definitions List[Raw]            `json:"definitions"`
	Files       Set                  `json:"files"`
	Usage       Record[*SecretUsage] `json:"usage"`
}

type Definitions struct {
	Definitions List[Raw] `json:"definitions"`
	Files       Set       `json:"files"`
}

type Scopes struct {
	Definitions List[Raw] `json:"definitions"`
	Files       Set       `json:"files"`
	// Declared holds declareScopes ids until addon scopes are merged
	// (applyDeclaredScopes, in finalize).
	Declared *Map[string] `json:"declared,omitempty"`
}

type Manifest struct {
	Initial Raw       `json:"initial"`
	Current Raw       `json:"current"`
	Errors  List[Raw] `json:"errors"`
}

type Middleware struct {
	Definitions   Record[*MiddlewareDefinition] `json:"definitions"`
	Instances     Record[*MiddlewareInstance]   `json:"instances"`
	GlobalFiles   Set                           `json:"globalFiles"`
	TagMiddleware Map[*MiddlewareGroupMeta]     `json:"tagMiddleware"`
}

type ChannelMiddleware struct {
	Definitions   Record[*MiddlewareDefinition] `json:"definitions"`
	Instances     Record[*MiddlewareInstance]   `json:"instances"`
	TagMiddleware Map[*MiddlewareGroupMeta]     `json:"tagMiddleware"`
}

type AgentMiddleware struct {
	Definitions Record[*MiddlewareDefinition] `json:"definitions"`
}

type Permissions struct {
	Definitions Record[*MiddlewareDefinition]       `json:"definitions"`
	Instances   Record[Raw]                         `json:"instances"`
	Global      List[*GlobalPermissionRegistration] `json:"global"`
}

// GlobalPermissionRegistration is InspectorGlobalPermissionRegistration: one
// addGlobalPermission call, which codegen imports the file of, or calls
// ExportName from when the call sits in an exported zero-argument factory.
type GlobalPermissionRegistration struct {
	SourceFile    string  `json:"sourceFile"`
	Position      int     `json:"position"`
	ExportName    *string `json:"exportName"`
	DefinitionIds Strings `json:"definitionIds"`
}

type ServiceAggregation struct {
	RequiredServices     Set     `json:"requiredServices"`
	UsedFunctions        Set     `json:"usedFunctions"`
	UsedMiddleware       Set     `json:"usedMiddleware"`
	UsedPermissions      Set     `json:"usedPermissions"`
	AllSingletonServices Strings `json:"allSingletonServices"`
	AllWireServices      Strings `json:"allWireServices"`
}

// ServiceTypes is InspectorServiceTypes: what finalize needs from the
// SingletonServices and Services types, read off the checker by analysis.
type ServiceTypes struct {
	// SingletonServices is sorted; nil (JSON null) when the type is unresolved.
	SingletonServices *Strings `json:"singletonServices"`
	// Services is unfiltered, in property order; nil when unresolved.
	Services      *Strings `json:"services"`
	SecretAliases Strings  `json:"secretAliases"`
}

type ResolvedIOType struct {
	InputType  string `json:"inputType"`
	OutputType string `json:"outputType"`
}

type ChannelMiddlewareGroups struct {
	Definitions Record[Raw] `json:"definitions"`
	Instances   Record[Raw] `json:"instances"`
	TagGroups   Record[Raw] `json:"tagGroups"`
}

type MiddlewareGroupsMeta struct {
	Definitions       Record[Raw]             `json:"definitions"`
	Instances         Record[Raw]             `json:"instances"`
	HTTPGroups        Record[Raw]             `json:"httpGroups"`
	TagGroups         Record[Raw]             `json:"tagGroups"`
	ChannelMiddleware ChannelMiddlewareGroups `json:"channelMiddleware"`
}

type PermissionsGroupsMeta struct {
	Definitions Record[Raw] `json:"definitions"`
}

type ExportedContracts struct {
	HTTP         Record[Raw] `json:"http"`
	CLI          Record[Raw] `json:"cli"`
	Channel      Record[Raw] `json:"channel"`
	AddonHTTP    Record[Raw] `json:"addonHttp"`
	AddonCLI     Record[Raw] `json:"addonCli"`
	AddonChannel Record[Raw] `json:"addonChannel"`
}

// New mirrors getInitialInspectorState(rootDir). Zero values of Record, Map,
// Set and List already encode as the empty `{}` / `[]`, so only the members
// whose initial value is not empty are set here.
func New(rootDir string) *State {
	s := &State{RootDir: rootDir}
	s.Functions.TypesMap = typesmap.New()
	for _, m := range HTTPMethods {
		s.HTTP.Meta.Set(m, NewRecord[*HTTPRouteMeta]())
	}
	s.Triggers.WebhookSourceMeta = NewRecord[Raw]()
	s.MCPEndpoints.Surfaces = NewRecord[string]()
	s.Manifest.Initial = Raw("null")
	s.Manifest.Current = Raw("null")
	s.OpenAPISpec = Raw("null")
	return s
}

// Marshal encodes the state as JSON.stringify(serializeInspectorState(s),
// null, indent) would.
func (s *State) Marshal(indent string) ([]byte, error) { return jsjson.Marshal(s, indent) }
