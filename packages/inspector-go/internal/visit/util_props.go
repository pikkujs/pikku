package visit

import (
	"errors"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Ports of utils/get-property-value.ts, utils/type-utils.ts,
// utils/extract-function-node.ts, utils/extract-services.ts,
// utils/middleware.ts, utils/permissions.ts and the body collectors.

var errNotStatic = errors.New("unable to extract string literal")

func (s *Context) extractStringLiteral(n *ast.Node) (string, error) {
	switch {
	case ast.IsStringLiteral(n), ast.IsNoSubstitutionTemplateLiteral(n):
		return n.Text(), nil
	case ast.IsTemplateExpression(n):
		te := n.AsTemplateExpression()
		out := te.Head.Text()
		for _, span := range te.TemplateSpans.Nodes {
			ts := span.AsTemplateSpan()
			out += "${" + tsutil.NodeText(ts.Expression) + "}" + ts.Literal.Text()
		}
		return out, nil
	case ast.IsAsExpression(n), n.Kind == ast.KindTypeAssertionExpression:
		return s.extractStringLiteral(n.Expression())
	case ast.IsBinaryExpression(n) && n.AsBinaryExpression().OperatorToken.Kind == ast.KindPlusToken:
		be := n.AsBinaryExpression()
		return s.concatOperand(be.Left) + s.concatOperand(be.Right), nil
	case ast.IsIdentifier(n):
		if sym := s.Checker.GetSymbolAtLocation(n); sym != nil && sym.ValueDeclaration != nil &&
			ast.IsVariableDeclaration(sym.ValueDeclaration) && sym.ValueDeclaration.Initializer() != nil {
			return s.extractStringLiteral(sym.ValueDeclaration.Initializer())
		}
	}
	return "", errNotStatic
}

func (s *Context) concatOperand(n *ast.Node) string {
	if v, err := s.extractStringLiteral(n); err == nil {
		return v
	}
	inner := n
	if ast.IsParenthesizedExpression(n) {
		inner = n.Expression()
	}
	return "${" + tsutil.NodeText(inner) + "}"
}

type commonMeta struct {
	disabled                    bool
	title, summary, description *string
	tags                        []string
	errors                      []string
	hasTags, hasErrors          bool
}

func (s *Context) getCommonWireMetaData(obj *ast.Node) commonMeta {
	var m commonMeta
	for _, p := range obj.Properties() {
		if !ast.IsPropertyAssignment(p) || !ast.IsIdentifier(p.Name()) {
			continue
		}
		init := p.Initializer()
		switch p.Name().Text() {
		case "disabled":
			if init.Kind == ast.KindTrueKeyword {
				m.disabled = true
			}
		case "title":
			if v, err := s.extractStringLiteral(init); err == nil {
				m.title = &v
			}
		case "summary":
			if v, err := s.extractStringLiteral(init); err == nil {
				m.summary = &v
			}
		case "description":
			if v, err := s.extractStringLiteral(init); err == nil {
				m.description = &v
			}
		case "tags":
			if ast.IsArrayLiteralExpression(init) {
				m.hasTags = true
				m.tags = []string{}
				for _, e := range init.Elements() {
					if ast.IsStringLiteral(e) {
						m.tags = append(m.tags, e.Text())
					}
				}
			}
		case "errors":
			if ast.IsArrayLiteralExpression(init) {
				m.hasErrors = true
				m.errors = []string{}
				for _, e := range init.Elements() {
					if ast.IsIdentifier(e) {
						m.errors = append(m.errors, e.Text())
					}
				}
			}
		}
	}
	return m
}

func (s *Context) getPropertyAssignmentInitializer(obj *ast.Node, name string, followShorthand bool) *ast.Node {
	for _, p := range obj.Properties() {
		if ast.IsPropertyAssignment(p) && ast.IsIdentifier(p.Name()) && p.Name().Text() == name {
			return p.Initializer()
		}
		if ast.IsMethodDeclaration(p) && ast.IsIdentifier(p.Name()) && p.Name().Text() == name {
			return p.Name()
		}
		if followShorthand && ast.IsShorthandPropertyAssignment(p) && p.Name().Text() == name {
			sym := s.resolveAlias(s.Checker.GetShorthandAssignmentValueSymbol(p))
			decl := tsutil.FirstDecl(sym)
			if decl != nil && ast.IsVariableDeclaration(decl) && decl.Initializer() != nil {
				init := decl.Initializer()
				if tsutil.IsFunctionLike(init) || ast.IsCallExpression(init) {
					return init
				}
			}
			if decl != nil && (ast.IsFunctionDeclaration(decl) || tsutil.IsFunctionLike(decl)) {
				return decl
			}
			return p.Name()
		}
	}
	return nil
}

func (s *Context) resolveFunctionDeclaration(n *ast.Node) *ast.Node {
	if ast.IsFunctionDeclaration(n) || tsutil.IsFunctionLike(n) {
		return n
	}
	if ast.IsCallExpression(n) && len(n.Arguments()) > 0 {
		if a := n.Arguments()[0]; tsutil.IsFunctionLike(a) {
			return a
		}
	}
	if ast.IsIdentifier(n) {
		sym := s.Checker.GetSymbolAtLocation(n)
		if sym == nil {
			return nil
		}
		decl := sym.ValueDeclaration
		if decl == nil {
			decl = tsutil.FirstDecl(sym)
		}
		if decl == nil {
			return nil
		}
		if ast.IsImportSpecifier(decl) {
			if aliased := s.Checker.GetAliasedSymbol(sym); aliased != nil {
				ad := aliased.ValueDeclaration
				if ad == nil {
					ad = tsutil.FirstDecl(aliased)
				}
				if ad != nil {
					if ast.IsVariableDeclaration(ad) && ad.Initializer() != nil {
						return s.resolveFunctionDeclaration(ad.Initializer())
					}
					if ast.IsFunctionDeclaration(ad) {
						return ad
					}
				}
			}
		}
		if ast.IsVariableDeclaration(decl) && decl.Initializer() != nil {
			return s.resolveFunctionDeclaration(decl.Initializer())
		}
		if ast.IsFunctionDeclaration(decl) {
			return decl
		}
	}
	return nil
}

var implementationKeys = []string{"func", "default", "browser", "cli"}

func (s *Context) extractFunctionNode(firstArg *ast.Node) (funcNode, resolved *ast.Node, isDirect bool) {
	funcNode = firstArg
	isDirect = true
	if ast.IsObjectLiteralExpression(firstArg) {
		isDirect = false
		for _, k := range implementationKeys {
			if init := s.getPropertyAssignmentInitializer(firstArg, k, true); init != nil {
				funcNode = init
				break
			}
		}
	}
	if ast.IsIdentifier(funcNode) {
		if sym := s.Checker.GetSymbolAtLocation(funcNode); sym != nil {
			decl := sym.ValueDeclaration
			if decl == nil {
				decl = tsutil.FirstDecl(sym)
			}
			if decl != nil && ast.IsVariableDeclaration(decl) && decl.Initializer() != nil {
				funcNode = decl.Initializer()
			}
		}
	}
	return funcNode, s.resolveFunctionDeclaration(funcNode), isDirect
}

func extractUsedWires(fn *ast.Node, idx int) WiresMeta {
	p := tsutil.ParamAt(fn, idx)
	if p != nil && ast.IsObjectBindingPattern(p.Name()) {
		w := tsutil.BindingNames(p)
		if w == nil {
			w = []string{}
		}
		return WiresMeta{Optimized: true, Wires: w}
	}
	if p != nil && ast.IsIdentifier(p.Name()) && p.Name().Text()[0] != '_' {
		return WiresMeta{Optimized: false, Wires: []string{}}
	}
	return WiresMeta{Optimized: true, Wires: []string{}}
}

func (s *Context) refId(n *ast.Node) string {
	return s.extractFunctionName(n).pikkuFuncId
}
