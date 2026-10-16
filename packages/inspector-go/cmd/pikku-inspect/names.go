package main

import (
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/scanner"
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
}

var nonAlnum = regexp.MustCompile(`[^a-zA-Z0-9]`)

func funcIdToTypeName(id string) string {
	var b strings.Builder
	for _, s := range nonAlnum.Split(id, -1) {
		if s == "" {
			continue
		}
		b.WriteString(strings.ToUpper(s[:1]) + s[1:])
	}
	return b.String()
}

func formatVersionedId(base string, version int) string {
	return fmt.Sprintf("%s@v%d", base, version)
}

func nodeStart(n *ast.Node) int {
	return scanner.GetTokenPosOfNode(n, ast.GetSourceFileOfNode(n), false)
}

// nodeText is ts.Node#getText(): the source text from the token start.
func nodeText(n *ast.Node) string {
	sf := ast.GetSourceFileOfNode(n)
	return sf.Text()[nodeStart(n):n.End()]
}

func (s *state) tempFuncId(n *ast.Node) string {
	sf := ast.GetSourceFileOfNode(n)
	rel, _ := filepath.Rel(s.rootDir, sf.FileName())
	// NOTE: TS hashes the UTF-16 offset; typescript-go positions are UTF-8 byte
	// offsets, so ids diverge for files with non-ASCII text before the call.
	sum := sha1.Sum([]byte(fmt.Sprintf("%s:%d", rel, nodeStart(n))))
	return "__temp_" + hex.EncodeToString(sum[:])[:16]
}

func isFunctionLike(n *ast.Node) bool {
	return n != nil && (ast.IsArrowFunction(n) || ast.IsFunctionExpression(n))
}

func isPikkuCall(n *ast.Node) bool {
	return n != nil && ast.IsCallExpression(n) && ast.IsIdentifier(n.Expression()) &&
		strings.HasPrefix(n.Expression().Text(), "pikku")
}

func hasExportModifier(n *ast.Node) bool {
	return n.ModifierFlags()&ast.ModifierFlagsExport != 0
}

func (s *state) resolveAlias(sym *ast.Symbol) *ast.Symbol {
	if sym != nil && sym.Flags&ast.SymbolFlagsAlias != 0 {
		if r := s.c.GetAliasedSymbol(sym); r != nil {
			return r
		}
	}
	return sym
}

func firstDecl(sym *ast.Symbol) *ast.Node {
	if sym == nil || len(sym.Declarations) == 0 {
		return nil
	}
	return sym.Declarations[0]
}

func (s *state) isNamedExport(decl *ast.Node) bool {
	parent := decl.Parent
	if parent == nil {
		return false
	}
	if ast.IsVariableDeclarationList(parent) {
		stmt := parent.Parent
		if stmt == nil {
			return false
		}
		if ast.IsVariableStatement(stmt) && hasExportModifier(stmt) {
			return true
		}
	}
	name := decl.Name()
	if name == nil || !ast.IsIdentifier(name) {
		return false
	}
	sf := ast.GetSourceFileOfNode(decl)
	modSym := s.c.GetSymbolAtLocation(sf.AsNode())
	if modSym == nil {
		modSym = sf.AsNode().Symbol()
	}
	if modSym == nil {
		return false
	}
	declSym := s.c.GetSymbolAtLocation(name)
	if declSym == nil {
		return false
	}
	for _, exp := range s.c.GetExportsOfModule(modSym) {
		if s.resolveAlias(exp) == declSym {
			return true
		}
	}
	return false
}

// exportedNameOfDecl handles the `func: someFunc` / shorthand resolution:
// variable initialised to pikkuX(fn) or a function, or a function declaration.
func (s *state) exportedNameOfDecl(decl *ast.Node) (string, bool) {
	if decl == nil {
		return "", false
	}
	if ast.IsVariableDeclaration(decl) && decl.Initializer() != nil {
		init := decl.Initializer()
		if isPikkuCall(init) {
			args := init.Arguments()
			if len(args) > 0 && isFunctionLike(args[0]) {
				if s.isNamedExport(decl) && ast.IsIdentifier(decl.Name()) {
					return decl.Name().Text(), true
				}
				return "", true
			}
			return "", false
		}
		if isFunctionLike(init) {
			if s.isNamedExport(decl) && ast.IsIdentifier(decl.Name()) {
				return decl.Name().Text(), true
			}
			return "", true
		}
		return "", false
	}
	if ast.IsFunctionDeclaration(decl) {
		if hasExportModifier(decl) && decl.Name() != nil {
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

func (s *state) extractFunctionName(callExpr *ast.Node) extractedName {
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

	// (workflow helper and wireHTTP identifier special cases are not ported:
	// addFunctions never reaches them.)

	if ast.IsCallExpression(callExpr) {
		args := callExpr.Arguments()
		if isPikkuCall(callExpr) && len(args) > 0 && ast.IsObjectLiteralExpression(args[0]) {
			extractOverrideAndVersion(args[0], &r)
		}
		if len(args) > 0 && ast.IsObjectLiteralExpression(args[0]) {
			for _, p := range args[0].Properties() {
				if ast.IsPropertyAssignment(p) && ast.IsIdentifier(p.Name()) && p.Name().Text() == "func" {
					init := p.Initializer()
					if ast.IsIdentifier(init) {
						if sym := s.c.GetSymbolAtLocation(init); sym != nil {
							if name, ok := s.exportedNameOfDecl(firstDecl(s.resolveAlias(sym))); ok && name != "" {
								r.exportedName = name
							}
						}
					}
					break
				}
				if ast.IsShorthandPropertyAssignment(p) && p.Name().Text() == "func" {
					if sym := s.c.GetShorthandAssignmentValueSymbol(p); sym != nil {
						if name, ok := s.exportedNameOfDecl(firstDecl(sym)); ok {
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
		if sym := s.c.GetSymbolAtLocation(callExpr); sym != nil {
			decl := firstDecl(s.resolveAlias(sym))
			if decl != nil && ast.IsVariableDeclaration(decl) && decl.Initializer() != nil {
				init := decl.Initializer()
				if isPikkuCall(init) {
					a := init.Arguments()
					if len(a) > 0 && ast.IsObjectLiteralExpression(a[0]) {
						extractOverrideAndVersion(a[0], &r)
					}
					if s.isNamedExport(decl) && ast.IsIdentifier(decl.Name()) {
						r.exportedName = decl.Name().Text()
					}
				} else if isFunctionLike(init) {
					if s.isNamedExport(decl) && ast.IsIdentifier(decl.Name()) {
						r.exportedName = decl.Name().Text()
					}
				}
			} else if decl != nil && ast.IsFunctionDeclaration(decl) {
				if hasExportModifier(decl) && decl.Name() != nil {
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
		r.pikkuFuncId = formatVersionedId(r.pikkuFuncId, r.version)
	}
	return r
}
