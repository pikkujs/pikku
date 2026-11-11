package visit

import (
	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// The node half of add-functions.ts: a function's `node: { displayName,
// category, type, errorOutput }` config becomes a state.nodes.meta entry.

type nodeConfig struct {
	displayName, category, nodeType string
	errorOutput                     *bool
}

// readNodeConfig reads the first `node: { ... }` object literal property and
// reports what it is missing. It returns nil when there is no such property.
func (s *Context) readNodeConfig(obj *ast.Node, name string) *nodeConfig {
	for _, p := range obj.Properties() {
		if !ast.IsPropertyAssignment(p) || !ast.IsIdentifier(p.Name()) || p.Name().Text() != "node" || !ast.IsObjectLiteralExpression(p.Initializer()) {
			continue
		}
		nodeObj := p.Initializer()
		cfg := &nodeConfig{
			displayName: tsutil.GetPropertyValue(nodeObj, "displayName").AsString(),
			category:    tsutil.GetPropertyValue(nodeObj, "category").AsString(),
			nodeType:    tsutil.GetPropertyValue(nodeObj, "type").AsString(),
			errorOutput: tsutil.GetPropertyValue(nodeObj, "errorOutput").Bool,
		}
		if cfg.displayName == "" {
			s.Log.Critical(diag.MissingName, "Function '"+name+"' node config is missing the required 'displayName' property.")
		}
		if cfg.category == "" {
			s.Log.Critical(diag.MissingName, "Function '"+name+"' node config is missing the required 'category' property.")
		}
		switch cfg.nodeType {
		case "":
			s.Log.Critical(diag.MissingName, "Function '"+name+"' node config is missing the required 'type' property.")
		case "trigger", "action", "end":
		default:
			s.Log.Critical(diag.InvalidValue, "Function '"+name+"' node config has invalid type '"+cfg.nodeType+"'. Must be 'trigger', 'action', or 'end'.")
		}
		return cfg
	}
	return nil
}

// addNodeMeta records the node when its config is complete. An invalid type
// is still recorded, as in TS: only the critical above flags it.
func (s *Context) addNodeMeta(cfg *nodeConfig, file, pikkuFuncId string, m *FunctionMeta) {
	if cfg.displayName == "" || cfg.category == "" || cfg.nodeType == "" {
		return
	}
	s.State.Nodes.Files.Add(file)
	var o jsObject
	o.set("name", pikkuFuncId)
	o.set("displayName", cfg.displayName)
	o.set("category", cfg.category)
	o.set("type", cfg.nodeType)
	o.set("rpc", pikkuFuncId)
	if m.Description != nil {
		o.set("description", *m.Description)
	}
	o.set("errorOutput", cfg.errorOutput != nil && *cfg.errorOutput)
	o.set("inputSchemaName", m.InputSchemaName)
	o.set("outputSchemaName", m.OutputSchemaName)
	if m.Tags != nil {
		o.set("tags", m.Tags)
	}
	s.State.Nodes.Meta.Set(pikkuFuncId, o.raw())
}
