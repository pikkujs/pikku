package visit

import (
	"fmt"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/scanner"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Port of add/check-indirect-registrations.ts: a middleware or permission
// helper passed around as a value registers nothing codegen can see, so a gate
// that never runs is reported instead of generated silently open.

func init() {
	Register(Visitor{Name: "checkIndirectRegistrations", Phase: PhaseSetup, Order: OrderCheckIndirectRegistrations, Visit: (*Context).checkIndirectRegistrations})
}

func isGateHelper(name string) bool { return middlewareHelpers(name) || permissionHelpers(name) }

// localGateNames is the names a file can reach a gate helper by: its own, and
// its import aliases.
func (s *Context) localGateNames(sf *ast.SourceFile) map[string]bool {
	if names, ok := s.gateNames[sf]; ok {
		return names
	}
	names := map[string]bool{}
	for _, st := range sf.Statements.Nodes {
		if !ast.IsImportDeclaration(st) {
			continue
		}
		clause := st.AsImportDeclaration().ImportClause
		if clause == nil {
			continue
		}
		bindings := clause.AsImportClause().NamedBindings
		if bindings == nil || !ast.IsNamedImports(bindings) {
			continue
		}
		for _, el := range bindings.AsNamedImports().Elements.Nodes {
			if isGateHelper(el.PropertyNameOrName().Text()) {
				names[el.Name().Text()] = true
			}
		}
	}
	if s.gateNames == nil {
		s.gateNames = map[*ast.SourceFile]map[string]bool{}
	}
	s.gateNames[sf] = names
	return names
}

// isAccountedFor is whether a reference sits where the inspector already sees
// it: called directly, imported or re-exported, bound to another const name,
// named as a declaration, or used as a type.
func isAccountedFor(reference *ast.Node) bool {
	parent := reference.Parent
	if parent == nil {
		return true
	}
	if ast.IsCallExpression(parent) && parent.Expression() == reference {
		return true
	}
	if ast.IsImportSpecifier(parent) || ast.IsExportSpecifier(parent) || ast.IsImportClause(parent) ||
		ast.IsNamespaceImport(parent) || ast.IsExportAssignment(parent) || ast.IsQualifiedName(parent) ||
		ast.IsTypeNode(parent) || ast.IsExpressionWithTypeArguments(parent) {
		return true
	}
	if ast.IsVariableDeclaration(parent) && parent.Initializer() == reference &&
		ast.GetCombinedNodeFlags(parent)&ast.NodeFlagsConst != 0 {
		return true
	}
	if parent.Name() == reference {
		return true
	}
	return isInsideDeclarationOf(reference, isGateHelper)
}

func (s *Context) checkIndirectRegistrations(node *ast.Node) {
	if !ast.IsIdentifier(node) {
		return
	}
	sf := ast.GetSourceFileOfNode(node)
	if sf == nil || sf.IsDeclarationFile {
		return
	}
	name := node.Text()
	if !isGateHelper(name) && !s.localGateNames(sf)[name] {
		return
	}

	reference := node
	if ast.IsPropertyAccessExpression(node.Parent) {
		if node.Parent.Name() != node || !s.isNamespaceReceiver(node.Parent.Expression()) {
			return
		}
		reference = node.Parent
	}
	if isAccountedFor(reference) {
		return
	}

	names := s.calleeNames(reference)
	helper := ""
	for i := len(names) - 1; i >= 0; i-- {
		if isGateHelper(names[i]) {
			helper = names[i]
			break
		}
	}
	if helper == "" {
		return
	}

	if sym := s.Checker.GetSymbolAtLocation(node); sym != nil && sym.ValueDeclaration != nil &&
		sym.ValueDeclaration.Kind == ast.KindParameter {
		return
	}
	t := s.Checker.GetTypeAtLocation(reference)
	if len(s.Checker.GetSignaturesOfType(t, checker.SignatureKindCall)) == 0 && t.Flags()&checker.TypeFlagsAny == 0 {
		return
	}

	line := scanner.GetECMALineOfPosition(sf, tsutil.NodeStart(node)) + 1
	s.Log.Diagnostic(diag.Error, diag.RegistrationNotADirectCall, fmt.Sprintf(
		"'%s' (%s) is used as a value at %s:%d. "+
			"The inspector records middleware and permissions only where %s is called directly, "+
			"so whatever this registers is never imported by the generated code and does not run. "+
			"Call %s(...) directly.",
		tsutil.NodeText(reference), helper, sf.FileName(), line, helper, helper))
}
