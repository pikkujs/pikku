package visit

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/typesmap"
)

// The element types visitors write, under their state names.
type (
	FunctionMeta    = state.FunctionMeta
	HTTPRouteMeta   = state.HTTPRouteMeta
	QueueWorkerMeta = state.QueueWorkerMeta
	ServicesMeta    = state.ServicesMeta
	WiresMeta       = state.WiresMeta
	WireRef         = state.WireRef
	AuditMeta       = state.AuditMeta
)

// Types is InspectorOptions.types: the configured names of the core types.
// Only finalize's getFilesAndMethods reads it; analysis passes it through.
type Types struct {
	ConfigFileType               string `json:"configFileType,omitempty"`
	UserSessionType              string `json:"userSessionType,omitempty"`
	SingletonServicesFactoryType string `json:"singletonServicesFactoryType,omitempty"`
	WireServicesFactoryType      string `json:"wireServicesFactoryType,omitempty"`
}

// Options is the subset of InspectorOptions the analysis reads.
type Options struct {
	SetupOnly bool
	// AllowComplexWorkflows is options.allow.complexWorkflows.
	AllowComplexWorkflows bool
	Types                 *Types
	IsAddon               bool
}

// Context is what every visitor receives: the TS visitors' (logger, checker,
// state, options) arguments in one place, plus the file being swept.
type Context struct {
	Checker    *checker.Checker
	State      *state.State
	Log        *diag.Logger
	Options    Options
	RootDir    string
	SourceFile *ast.SourceFile

	// Stand-ins for setup-phase state whose visitor groups are not ported
	// (addMiddleware, addPermission, addWireAddon, addHTTPMiddleware): just
	// what the ported groups read back. They become real state sections when
	// those groups are ported.
	middlewareDefs      map[string]definition
	permissionDefs      map[string]definition
	tagMiddleware       map[string]bool
	httpRouteMiddleware []string
	addons              map[string]*addonDecl
	addonOrder          []string

	// typesLookup is InspectorState.typesLookup: live checker types, read
	// only during analysis. What finalize needs from it is serialized as
	// state.coreTypeProperties instead.
	typesLookup map[string][]*checker.Type
	coreTypes   []coreType

	// cliConfigTypeWarned is add-cli.ts's module-level configTypeWarningShown.
	cliConfigTypeWarned bool
}

type definition struct {
	exported bool
}

func NewContext(c *checker.Checker, st *state.State, log *diag.Logger, opts Options) *Context {
	return &Context{
		Checker:        c,
		State:          st,
		Log:            log,
		Options:        opts,
		RootDir:        st.RootDir,
		middlewareDefs: map[string]definition{},
		permissionDefs: map[string]definition{},
		tagMiddleware:  map[string]bool{},
		addons:         map[string]*addonDecl{},
		typesLookup:    map[string][]*checker.Type{},
	}
}

func (s *Context) TypesMap() *typesmap.TypesMap { return s.State.Functions.TypesMap }
