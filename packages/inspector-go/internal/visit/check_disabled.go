package visit

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"sort"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/scanner"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Port of add/check-disabled-references.ts: a function declared `disabled` is
// left out of the build, and anything still referencing it is PKU562.

func init() {
	Register(Visitor{Name: "checkDisabledReferences", Phase: PhaseRoutes, Order: OrderCheckDisabledRefs, Visit: (*Context).checkDisabledReferences})
}

// readFunctionDisabled reads a function's `disabled`: `true`, or a non-empty
// string saying why. Anything else the build cannot read is refused rather
// than taken as enabled.
func (s *Context) readFunctionDisabled(obj *ast.Node, name string) (string, bool) {
	for _, p := range obj.Properties() {
		if !ast.IsPropertyAssignment(p) || !ast.IsIdentifier(p.Name()) || p.Name().Text() != "disabled" {
			continue
		}
		init := p.Initializer()
		if init.Kind == ast.KindTrueKeyword {
			return "", true
		}
		if init.Kind == ast.KindFalseKeyword {
			return "", false
		}
		if (ast.IsStringLiteral(init) || ast.IsNoSubstitutionTemplateLiteral(init)) && init.Text() != "" {
			return init.Text(), true
		}
		s.Log.Critical(diag.InvalidValue, fmt.Sprintf(
			"'%s' has a `disabled` the build cannot read. Use `true` or a non-empty string literal.", name))
		return "", true
	}
	return "", false
}

func (s *Context) relToRoot(file string) string {
	rel, err := filepath.Rel(s.RootDir, file)
	if err != nil {
		return file
	}
	return rel
}

func (s *Context) describeDisabled(meta *state.DisabledFunctionMeta) string {
	reason := ""
	if meta.Reason != "" {
		reason = " (" + meta.Reason + ")"
	}
	return fmt.Sprintf("'%s' is disabled%s in %s", meta.Name, reason, s.relToRoot(meta.SourceFile))
}

func (s *Context) disabledPosition(node *ast.Node) string {
	sf := ast.GetSourceFileOfNode(node)
	line := scanner.GetECMALineOfPosition(sf, tsutil.NodeStart(node)) + 1
	return fmt.Sprintf("%s:%d", s.relToRoot(sf.FileName()), line)
}

// enclosingCallee is the call a reference sits in, by its callee.
func enclosingCallee(node *ast.Node) string {
	for current := node.Parent; current != nil; current = current.Parent {
		if ast.IsCallExpression(current) {
			callee := current.Expression()
			if ast.IsIdentifier(callee) || ast.IsPropertyAccessExpression(callee) {
				return tsutil.NodeText(callee)
			}
		}
	}
	return ""
}

// recordDisabledFunction records a function declared `disabled` in place of
// everything addFunctions would otherwise record. One defined inline in what
// uses it is referenced by that, so it is refused instead.
func (s *Context) recordDisabledFunction(node *ast.Node, pikkuFuncId string, meta *state.DisabledFunctionMeta) {
	if parent := node.Parent; parent != nil && ast.IsVariableDeclaration(parent) && parent.Initializer() == node {
		if s.State.Functions.Disabled == nil {
			s.State.Functions.Disabled = state.NewRecord[*state.DisabledFunctionMeta]()
		}
		s.State.Functions.Disabled.Set(pikkuFuncId, meta)
		return
	}
	inside := ""
	if call := enclosingCallee(node); call != "" {
		inside = " inside " + call + "(...)"
	}
	s.Log.Critical(diag.DisabledFunctionReferenced, fmt.Sprintf(
		"A function declared `disabled` is defined inline at %s%s, which still uses it. Remove what uses it, or remove `disabled`.",
		s.disabledPosition(node), inside))
}

// disabledByLocalName indexes disabled functions by the name code reaches
// them by: the export, else the name. Built once, after addFunctions.
func (s *Context) disabledByLocalName() map[string][]*state.DisabledFunctionMeta {
	if s.disabledIndex != nil {
		return s.disabledIndex
	}
	index := map[string][]*state.DisabledFunctionMeta{}
	s.State.Functions.Disabled.Each(func(_ string, meta *state.DisabledFunctionMeta) {
		local := meta.ExportedName
		if local == "" {
			local = meta.Name
		}
		index[local] = append(index[local], meta)
	})
	s.disabledIndex = index
	return index
}

// isInsideDisabled is whether a node sits in a disabled function's own
// definition, whose body is dead too.
func (s *Context) isInsideDisabled(node *ast.Node) bool {
	fileName := ast.GetSourceFileOfNode(node).FileName()
	index := s.disabledByLocalName()
	for current := node.Parent; current != nil; current = current.Parent {
		if !ast.IsVariableDeclaration(current) || !ast.IsIdentifier(current.Name()) {
			continue
		}
		for _, meta := range index[current.Name().Text()] {
			if meta.SourceFile == fileName {
				return true
			}
		}
	}
	return false
}

func isNotADisabledReference(node *ast.Node) bool {
	parent := node.Parent
	if parent == nil {
		return true
	}
	if ast.IsImportSpecifier(parent) || ast.IsExportSpecifier(parent) || ast.IsImportClause(parent) ||
		ast.IsNamespaceImport(parent) || ast.IsTypeQueryNode(parent) || ast.IsQualifiedName(parent) {
		return true
	}
	if ast.IsShorthandPropertyAssignment(parent) {
		return false
	}
	return parent.Name() == node
}

func (s *Context) resolveReferenceDeclaration(node *ast.Node) *ast.Node {
	var sym *ast.Symbol
	if ast.IsShorthandPropertyAssignment(node.Parent) {
		sym = s.Checker.GetShorthandAssignmentValueSymbol(node.Parent)
	} else {
		sym = s.Checker.GetSymbolAtLocation(node)
	}
	sym = s.resolveAlias(sym)
	if sym == nil {
		return nil
	}
	if sym.ValueDeclaration != nil {
		return sym.ValueDeclaration
	}
	return tsutil.FirstDecl(sym)
}

// invokedRpcName is the name in `rpc.invoke('x')` / `rpc.mesh('x')`, seen
// through `!` and parentheses.
func invokedRpcName(node *ast.Node) (string, bool) {
	callee := node.Expression()
	if !ast.IsPropertyAccessExpression(callee) {
		return "", false
	}
	if method := callee.Name().Text(); method != "invoke" && method != "mesh" {
		return "", false
	}
	receiver := callee.Expression()
	for ast.IsNonNullExpression(receiver) || ast.IsParenthesizedExpression(receiver) {
		receiver = receiver.Expression()
	}
	isRpc := false
	if ast.IsIdentifier(receiver) {
		isRpc = receiver.Text() == "rpc"
	} else if ast.IsPropertyAccessExpression(receiver) {
		isRpc = receiver.Name().Text() == "rpc"
	}
	args := node.Arguments()
	if !isRpc || len(args) == 0 {
		return "", false
	}
	first := args[0]
	if !ast.IsStringLiteral(first) && !ast.IsNoSubstitutionTemplateLiteral(first) {
		return "", false
	}
	return first.Text(), true
}

func (s *Context) disabledByName(name string) *state.DisabledFunctionMeta {
	var found *state.DisabledFunctionMeta
	s.State.Functions.Disabled.Each(func(_ string, meta *state.DisabledFunctionMeta) {
		if found == nil && meta.Name == name {
			found = meta
		}
	})
	return found
}

func (s *Context) checkDisabledReferences(node *ast.Node) {
	if s.State.Functions.Disabled == nil || s.State.Functions.Disabled.Len() == 0 {
		return
	}

	if ast.IsCallExpression(node) {
		invoked, ok := invokedRpcName(node)
		if !ok {
			return
		}
		meta := s.disabledByName(invoked)
		if meta == nil || s.isInsideDisabled(node) {
			return
		}
		s.Log.Critical(diag.DisabledFunctionReferenced, fmt.Sprintf(
			"%s, but %s('%s') calls it at %s. Remove the call, or remove `disabled`.",
			s.describeDisabled(meta), tsutil.NodeText(node.Expression()), invoked, s.disabledPosition(node)))
		return
	}

	if !ast.IsIdentifier(node) {
		return
	}
	candidates := s.disabledByLocalName()[node.Text()]
	if len(candidates) == 0 || isNotADisabledReference(node) {
		return
	}
	decl := s.resolveReferenceDeclaration(node)
	if decl == nil || !ast.IsVariableDeclaration(decl) || !ast.IsIdentifier(decl.Name()) {
		return
	}
	declFile := ast.GetSourceFileOfNode(decl).FileName()
	declName := decl.Name().Text()
	var meta *state.DisabledFunctionMeta
	for _, m := range candidates {
		local := m.ExportedName
		if local == "" {
			local = m.Name
		}
		if m.SourceFile == declFile && local == declName {
			meta = m
			break
		}
	}
	if meta == nil || s.isInsideDisabled(node) {
		return
	}
	what := "it is referenced"
	if call := enclosingCallee(node); call != "" {
		what = call + "(...) references it"
	}
	s.Log.Critical(diag.DisabledFunctionReferenced, fmt.Sprintf(
		"%s, but %s at %s. Remove the reference, or remove `disabled`.",
		s.describeDisabled(meta), what, s.disabledPosition(node)))
}

func collectRpcNames(value any, into map[string]bool) {
	switch v := value.(type) {
	case []any:
		for _, item := range v {
			collectRpcNames(item, into)
		}
	case map[string]any:
		for key, child := range v {
			if name, ok := child.(string); ok && key == "rpcName" {
				into[name] = true
			} else {
				collectRpcNames(child, into)
			}
		}
	}
}

// CheckDisabledWorkflowSteps is PKU562 for workflow steps, which name the
// function they call as a string the workflow meta already holds. Runs once,
// after the routes sweep.
func (s *Context) CheckDisabledWorkflowSteps() {
	if s.State.Functions.Disabled == nil || s.State.Functions.Disabled.Len() == 0 {
		return
	}
	sections := []struct {
		kind    string
		section *state.Record[state.Raw]
	}{
		{"workflow", &s.State.Workflows.Meta},
		{"workflow graph", &s.State.Workflows.GraphMeta},
	}
	for _, sec := range sections {
		sec.section.Each(func(workflowName string, raw state.Raw) {
			var decoded any
			if err := json.Unmarshal(raw, &decoded); err != nil {
				return
			}
			names := map[string]bool{}
			collectRpcNames(decoded, names)
			sorted := make([]string, 0, len(names))
			for name := range names {
				sorted = append(sorted, name)
			}
			sort.Strings(sorted)
			for _, rpcName := range sorted {
				target := s.disabledByName(rpcName)
				if target == nil {
					continue
				}
				s.Log.Critical(diag.DisabledFunctionReferenced, fmt.Sprintf(
					"%s, but %s '%s' calls it as a step. Remove the step, or remove `disabled`.",
					s.describeDisabled(target), sec.kind, workflowName))
			}
		})
	}
}
