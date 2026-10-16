package main

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
)

type ServicesMeta struct {
	Optimized bool     `json:"optimized"`
	Services  []string `json:"services"`
}

type WiresMeta struct {
	Optimized bool     `json:"optimized"`
	Wires     []string `json:"wires"`
}

type WireRef struct {
	Type   string `json:"type"`
	Name   string `json:"name,omitempty"`
	Tag    string `json:"tag,omitempty"`
	Inline *bool  `json:"inline,omitempty"`
	Route  string `json:"route,omitempty"`
}

type AuditMeta struct {
	Durability string `json:"durability"`
}

// FunctionMeta mirrors FunctionsMeta[string] from @pikku/core. Pointer / omitempty
// fields are the ones the TS inspector writes as `undefined` when unset.
type FunctionMeta struct {
	PikkuFuncId                     string       `json:"pikkuFuncId"`
	FunctionType                    string       `json:"functionType"`
	FuncWrapper                     string       `json:"funcWrapper,omitempty"`
	Sessionless                     *bool        `json:"sessionless,omitempty"`
	Name                            string       `json:"name"`
	Services                        ServicesMeta `json:"services"`
	Wires                           *WiresMeta   `json:"wires,omitempty"`
	Invokes                         []string     `json:"invokes,omitempty"`
	InputSchemaName                 *string      `json:"inputSchemaName"`
	OutputSchemaName                *string      `json:"outputSchemaName"`
	Inputs                          []string     `json:"inputs"`
	Outputs                         []string     `json:"outputs"`
	Expose                          *bool        `json:"expose,omitempty"`
	Auth                            *bool        `json:"auth,omitempty"`
	PermissionsInBody               *bool        `json:"permissionsInBody,omitempty"`
	Audit                           *AuditMeta   `json:"audit,omitempty"`
	Remote                          *bool        `json:"remote,omitempty"`
	ScenarioStep                    *bool        `json:"scenarioStep,omitempty"`
	WebhookReceive                  *bool        `json:"webhookReceive,omitempty"`
	Scenario                        *bool        `json:"scenario,omitempty"`
	MCP                             *bool        `json:"mcp,omitempty"`
	Readonly                        *bool        `json:"readonly,omitempty"`
	Deploy                          string       `json:"deploy,omitempty"`
	ApprovalRequired                *bool        `json:"approvalRequired,omitempty"`
	ApprovalDescription             string       `json:"approvalDescription,omitempty"`
	WorkflowQueued                  *bool        `json:"workflowQueued,omitempty"`
	WorkflowRetries                 *float64     `json:"workflowRetries,omitempty"`
	WorkflowTimeout                 string       `json:"workflowTimeout,omitempty"`
	Compensate                      *bool        `json:"compensate,omitempty"`
	ScenarioStepSurfaces            []string     `json:"scenarioStepSurfaces,omitempty"`
	ScenarioStepRequiresVirtualUser *bool        `json:"scenarioStepRequiresVirtualUser,omitempty"`
	ScenarioStepKind                string       `json:"scenarioStepKind,omitempty"`
	ScenarioStepAddon               string       `json:"scenarioStepAddon,omitempty"`
	ScenarioStepTemplate            string       `json:"scenarioStepTemplate,omitempty"`
	Scopes                          []string     `json:"scopes,omitempty"`
	ImplementationHash              string       `json:"implementationHash,omitempty"`
	Version                         *int         `json:"version,omitempty"`
	Title                           *string      `json:"title,omitempty"`
	Tags                            []string     `json:"tags,omitempty"`
	Summary                         *string      `json:"summary,omitempty"`
	Description                     *string      `json:"description,omitempty"`
	Errors                          []string     `json:"errors,omitempty"`
	Middleware                      []WireRef    `json:"middleware,omitempty"`
	Permissions                     []WireRef    `json:"permissions,omitempty"`
	IsDirectFunction                *bool        `json:"isDirectFunction,omitempty"`
	SourceFile                      string       `json:"sourceFile,omitempty"`
	BodySourceFile                  string       `json:"bodySourceFile,omitempty"`
	ExportedName                    string       `json:"exportedName,omitempty"`
	BodyStart                       *int         `json:"bodyStart,omitempty"`
	BodyEnd                         *int         `json:"bodyEnd,omitempty"`
	StartsWorkflows                 []string     `json:"startsWorkflows,omitempty"`

	inline bool
}

type definition struct {
	exported bool
}

type state struct {
	rootDir  string
	c        *checker.Checker
	meta     map[string]*FunctionMeta
	typesMap *TypesMap

	middlewareDefs map[string]definition
	permissionDefs map[string]definition
	tagMiddleware  map[string]bool

	httpRouteMiddleware []string
	addons              map[string]*addonDecl
	addonOrder          []string
	addonFunctions      map[string]map[string]*FunctionMeta
	http                map[string]map[string]*HTTPRouteMeta
	queues              map[string]*QueueWorkerMeta
}

func newState(rootDir string, c *checker.Checker) *state {
	return &state{
		rootDir:        rootDir,
		c:              c,
		meta:           map[string]*FunctionMeta{},
		typesMap:       newTypesMap(),
		middlewareDefs: map[string]definition{},
		permissionDefs: map[string]definition{},
		tagMiddleware:  map[string]bool{},
		addons:         map[string]*addonDecl{},
		addonFunctions: map[string]map[string]*FunctionMeta{},
		http:           map[string]map[string]*HTTPRouteMeta{},
		queues:         map[string]*QueueWorkerMeta{},
	}
}

// visitSetup is a deliberately tiny subset of the TS setup sweep: it records
// middleware/permission definitions (to answer `inline`) and addTagMiddleware
// tags (to resolve tag middleware on functions).
func (s *state) visitSetup(node *ast.Node) {
	if !ast.IsCallExpression(node) {
		return
	}
	callee := node.Expression()
	if !ast.IsIdentifier(callee) {
		return
	}
	args := node.Arguments()
	switch callee.Text() {
	case "pikkuMiddleware", "pikkuMiddlewareFactory":
		r := s.extractFunctionName(node)
		s.middlewareDefs[r.pikkuFuncId] = definition{exported: r.exportedName != ""}
	case "pikkuPermission", "pikkuPermissionFactory":
		r := s.extractFunctionName(node)
		s.permissionDefs[r.pikkuFuncId] = definition{exported: r.exportedName != ""}
	case "addTagMiddleware":
		if len(args) >= 2 && ast.IsStringLiteral(args[0]) && ast.IsArrayLiteralExpression(args[1]) {
			s.tagMiddleware[args[0].Text()] = true
		}
	}
}

func boolPtr(b bool) *bool { return &b }

// orNil returns &b when b is true, mirroring the TS `x || undefined` idiom.
func orNil(b bool) *bool {
	if b {
		return &b
	}
	return nil
}

func strPtr(s string) *string { return &s }
