package visit

import (
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Port of utils/extract-function-name.ts (the paths addFunctions and the
// middleware/permission resolvers reach).

type extractedName struct {
	pikkuFuncId  string
	name         string
	explicitName string
	exportedName string
	propertyName string
	version      int // 0 = none
	// isHelper: the function is a workflow helper call (`workflow('name')`,
	// `workflowStart`, `workflowStatus`, `graphStart`).
	isHelper bool
}

func (s *Context) tempFuncId(n *ast.Node) string {
	sf := ast.GetSourceFileOfNode(n)
	rel, _ := filepath.Rel(s.RootDir, sf.FileName())
	// TS hashes the UTF-16 offset; typescript-go positions are UTF-8 byte offsets.
	sum := sha1.Sum([]byte(fmt.Sprintf("%s:%d", rel, tsutil.UTF16Offset(sf.Text(), tsutil.NodeStart(n)))))
	return "__temp_" + hex.EncodeToString(sum[:])[:16]
}

func (s *Context) resolveAlias(sym *ast.Symbol) *ast.Symbol {
	if sym != nil && sym.Flags&ast.SymbolFlagsAlias != 0 {
		if r := s.Checker.GetAliasedSymbol(sym); r != nil {
			return r
		}
	}
	return sym
}

func (s *Context) isNamedExport(decl *ast.Node) bool {
	parent := decl.Parent
	if parent == nil {
		return false
	}
	if ast.IsVariableDeclarationList(parent) {
		stmt := parent.Parent
		if stmt == nil {
			return false
		}
		if ast.IsVariableStatement(stmt) && tsutil.HasExportModifier(stmt) {
			return true
		}
	}
	name := decl.Name()
	if name == nil || !ast.IsIdentifier(name) {
		return false
	}
	sf := ast.GetSourceFileOfNode(decl)
	modSym := s.Checker.GetSymbolAtLocation(sf.AsNode())
	if modSym == nil {
		modSym = sf.AsNode().Symbol()
	}
	if modSym == nil {
		return false
	}
	declSym := s.Checker.GetSymbolAtLocation(name)
	if declSym == nil {
		return false
	}
	for _, exp := range s.Checker.GetExportsOfModule(modSym) {
		if s.resolveAlias(exp) == declSym {
			return true
		}
	}
	return false
}

// exportedNameOfDecl handles the `func: someFunc` / shorthand resolution:
// variable initialised to pikkuX(fn) or a function, or a function declaration.
func (s *Context) exportedNameOfDecl(decl *ast.Node) (string, bool) {
	if decl == nil {
		return "", false
	}
	if ast.IsVariableDeclaration(decl) && decl.Initializer() != nil {
		init := decl.Initializer()
		if tsutil.IsPikkuCall(init) {
			args := init.Arguments()
			if len(args) > 0 && tsutil.IsFunctionLike(args[0]) {
				if s.isNamedExport(decl) && ast.IsIdentifier(decl.Name()) {
					return decl.Name().Text(), true
				}
				return "", true
			}
			return "", false
		}
		if tsutil.IsFunctionLike(init) {
			if s.isNamedExport(decl) && ast.IsIdentifier(decl.Name()) {
				return decl.Name().Text(), true
			}
			return "", true
		}
		return "", false
	}
	if ast.IsFunctionDeclaration(decl) {
		if tsutil.HasExportModifier(decl) && decl.Name() != nil {
			return decl.Name().Text(), true
		}
		return "", true
	}
	return "", false
}

var scenarioStepWrappers = map[string]bool{
	"pikkuScenarioStep": true, "pikkuPlatformScenarioStep": true, "pikkuAddonScenarioStep": true,
}

func extractOverrideAndVersion(obj *ast.Node, r *extractedName) {
	for _, p := range obj.Properties() {
		if !ast.IsPropertyAssignment(p) || !ast.IsIdentifier(p.Name()) {
			continue
		}
		init := p.Initializer()
		switch p.Name().Text() {
		case "override":
			if ast.IsStringLiteral(init) && r.explicitName == "" {
				r.explicitName = init.Text()
			}
		case "version":
			if ast.IsNumericLiteral(init) && r.version == 0 {
				if v, err := strconv.ParseFloat(init.Text(), 64); err == nil && v >= 1 && v == float64(int(v)) {
					r.version = int(v)
				}
			}
		}
	}
}

func (s *Context) extractFunctionName(callExpr *ast.Node) extractedName {
	var r extractedName
	parent := callExpr.Parent

	if ast.IsCallExpression(callExpr) && ast.IsIdentifier(callExpr.Expression()) && scenarioStepWrappers[callExpr.Expression().Text()] {
		args := callExpr.Arguments()
		if len(args) > 0 && ast.IsObjectLiteralExpression(args[0]) {
			for _, p := range args[0].Properties() {
				if ast.IsPropertyAssignment(p) && ast.IsIdentifier(p.Name()) && p.Name().Text() == "name" && ast.IsStringLiteral(p.Initializer()) {
					r.explicitName = p.Initializer().Text()
					break
				}
			}
		}
	}

	if ast.IsCallExpression(callExpr) && ast.IsIdentifier(callExpr.Expression()) && workflowHelpers[callExpr.Expression().Text()] {
		helper := callExpr.Expression().Text()
		args := callExpr.Arguments()
		if len(args) > 0 && ast.IsStringLiteral(args[0]) {
			id := helper + ":" + args[0].Text()
			if helper == "graphStart" && len(args) > 1 && ast.IsStringLiteral(args[1]) {
				id = helper + ":" + args[0].Text() + ":" + args[1].Text()
			}
			r.pikkuFuncId, r.name, r.explicitName, r.isHelper = id, id, id, true
			return r
		}
	}

	// (The wireHTTP identifier special case is not ported: the general path
	// below gives the same id.)

	if ast.IsCallExpression(callExpr) {
		args := callExpr.Arguments()
		if tsutil.IsPikkuCall(callExpr) && len(args) > 0 && ast.IsObjectLiteralExpression(args[0]) {
			extractOverrideAndVersion(args[0], &r)
		}
		if len(args) > 0 && ast.IsObjectLiteralExpression(args[0]) {
			for _, p := range args[0].Properties() {
				if ast.IsPropertyAssignment(p) && ast.IsIdentifier(p.Name()) && p.Name().Text() == "func" {
					init := p.Initializer()
					if ast.IsIdentifier(init) {
						if sym := s.Checker.GetSymbolAtLocation(init); sym != nil {
							if name, ok := s.exportedNameOfDecl(tsutil.FirstDecl(s.resolveAlias(sym))); ok && name != "" {
								r.exportedName = name
							}
						}
					}
					break
				}
				if ast.IsShorthandPropertyAssignment(p) && p.Name().Text() == "func" {
					if sym := s.Checker.GetShorthandAssignmentValueSymbol(p); sym != nil {
						if name, ok := s.exportedNameOfDecl(tsutil.FirstDecl(sym)); ok {
							if name != "" {
								r.exportedName = name
							}
							break
						}
					}
				}
			}
		}
	} else if ast.IsIdentifier(callExpr) {
		if sym := s.Checker.GetSymbolAtLocation(callExpr); sym != nil {
			decl := tsutil.FirstDecl(s.resolveAlias(sym))
			if decl != nil && ast.IsVariableDeclaration(decl) && decl.Initializer() != nil {
				init := decl.Initializer()
				if tsutil.IsPikkuCall(init) {
					a := init.Arguments()
					if len(a) > 0 && ast.IsObjectLiteralExpression(a[0]) {
						extractOverrideAndVersion(a[0], &r)
					}
					if s.isNamedExport(decl) && ast.IsIdentifier(decl.Name()) {
						r.exportedName = decl.Name().Text()
					}
				} else if tsutil.IsFunctionLike(init) {
					if s.isNamedExport(decl) && ast.IsIdentifier(decl.Name()) {
						r.exportedName = decl.Name().Text()
					}
				}
			} else if decl != nil && ast.IsFunctionDeclaration(decl) {
				if tsutil.HasExportModifier(decl) && decl.Name() != nil {
					r.exportedName = decl.Name().Text()
				}
			}
		}
	}

	if parent != nil {
		switch {
		case ast.IsVariableDeclaration(parent) && ast.IsIdentifier(parent.Name()):
			if s.isNamedExport(parent) {
				r.exportedName = parent.Name().Text()
			}
		case (ast.IsPropertyAssignment(parent) || ast.IsShorthandPropertyAssignment(parent)) && ast.IsIdentifier(parent.Name()):
			r.propertyName = parent.Name().Text()
		case ast.IsCallExpression(callExpr):
			args := callExpr.Arguments()
			if len(args) > 0 && ast.IsObjectLiteralExpression(args[0]) {
				extractOverrideAndVersion(args[0], &r)
			}
		}
	}

	switch {
	case r.explicitName != "":
		r.pikkuFuncId = r.explicitName
	case r.exportedName != "":
		r.pikkuFuncId = r.exportedName
	default:
		r.pikkuFuncId = s.tempFuncId(callExpr)
	}
	// populateNameByPriority
	r.name = r.pikkuFuncId
	if r.explicitName != "" {
		r.name = r.explicitName
	} else if r.exportedName != "" {
		r.name = r.exportedName
	}

	if r.version != 0 {
		suffix := fmt.Sprintf("V%d", r.version)
		if strings.HasSuffix(r.pikkuFuncId, suffix) && len(r.pikkuFuncId) > len(suffix) {
			r.pikkuFuncId = strings.TrimSuffix(r.pikkuFuncId, suffix)
		}
		r.pikkuFuncId = tsutil.FormatVersionedId(r.pikkuFuncId, r.version)
	}
	return r
}
