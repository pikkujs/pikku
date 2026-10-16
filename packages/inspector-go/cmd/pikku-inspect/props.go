package main

import (
	"errors"
	"sort"
	"strconv"

	"github.com/microsoft/typescript-go/shim/ast"
)

// Ports of utils/get-property-value.ts, utils/type-utils.ts,
// utils/extract-function-node.ts, utils/extract-services.ts,
// utils/middleware.ts, utils/permissions.ts and the body collectors.

func findPropertyAssignment(obj *ast.Node, name string) *ast.Node {
	for _, p := range obj.Properties() {
		if ast.IsPropertyAssignment(p) && ast.IsIdentifier(p.Name()) && p.Name().Text() == name {
			return p
		}
	}
	return nil
}

func unwrapAs(n *ast.Node) *ast.Node {
	for ast.IsAsExpression(n) || ast.IsSatisfiesExpression(n) {
		n = n.Expression()
	}
	return n
}

func foldStaticString(n *ast.Node) (string, bool) {
	switch {
	case ast.IsStringLiteral(n) || ast.IsNoSubstitutionTemplateLiteral(n):
		return n.Text(), true
	case ast.IsParenthesizedExpression(n), ast.IsAsExpression(n), n.Kind == ast.KindTypeAssertionExpression:
		return foldStaticString(n.Expression())
	case ast.IsBinaryExpression(n):
		be := n.AsBinaryExpression()
		if be.OperatorToken.Kind != ast.KindPlusToken {
			return "", false
		}
		l, ok := foldStaticString(be.Left)
		if !ok {
			return "", false
		}
		r, ok := foldStaticString(be.Right)
		if !ok {
			return "", false
		}
		return l + r, true
	}
	return "", false
}

// propValue is the union getPropertyValue returns: string | string[] | number | boolean | null.
type propValue struct {
	present bool
	str     *string
	strs    []string
	num     *float64
	boolean *bool
}

func getPropertyValue(obj *ast.Node, name string) propValue {
	p := findPropertyAssignment(obj, name)
	if p == nil {
		return propValue{}
	}
	init := p.Initializer()
	if (name == "query" || name == "tags") && ast.IsArrayLiteralExpression(init) {
		var out []string
		for _, e := range init.Elements() {
			if ast.IsStringLiteral(e) {
				out = append(out, e.Text())
			}
		}
		if len(out) == 0 {
			return propValue{}
		}
		return propValue{present: true, strs: out}
	}
	switch init.Kind {
	case ast.KindTrueKeyword:
		return propValue{present: true, boolean: boolPtr(true)}
	case ast.KindFalseKeyword:
		return propValue{present: true, boolean: boolPtr(false)}
	}
	if ast.IsNumericLiteral(init) {
		if name == "name" || name == "schedule" {
			return propValue{present: true, str: strPtr(init.Text())}
		}
		f, _ := strconv.ParseFloat(init.Text(), 64)
		return propValue{present: true, num: &f}
	}
	if s, ok := foldStaticString(init); ok {
		return propValue{present: true, str: &s}
	}
	t := nodeText(init)
	return propValue{present: true, str: &t}
}

// truthyBool mirrors `getPropertyValue(...) as boolean | undefined` followed by `|| undefined`.
func (v propValue) truthy() bool {
	switch {
	case v.boolean != nil:
		return *v.boolean
	case v.str != nil:
		return *v.str != ""
	case v.num != nil:
		return *v.num != 0
	case v.strs != nil:
		return true
	}
	return false
}

func (v propValue) asString() string {
	if v.str != nil {
		return *v.str
	}
	return ""
}

func getArrayPropertyValue(obj *ast.Node, name string) ([]string, bool) {
	p := findPropertyAssignment(obj, name)
	if p == nil {
		return nil, false
	}
	init := unwrapAs(p.Initializer())
	if !ast.IsArrayLiteralExpression(init) {
		return nil, false
	}
	out := []string{}
	for _, e := range init.Elements() {
		if ast.IsStringLiteral(e) {
			out = append(out, e.Text())
		}
	}
	return out, true
}

var errNotStatic = errors.New("unable to extract string literal")

func (s *state) extractStringLiteral(n *ast.Node) (string, error) {
	switch {
	case ast.IsStringLiteral(n), ast.IsNoSubstitutionTemplateLiteral(n):
		return n.Text(), nil
	case ast.IsTemplateExpression(n):
		te := n.AsTemplateExpression()
		out := te.Head.Text()
		for _, span := range te.TemplateSpans.Nodes {
			ts := span.AsTemplateSpan()
			out += "${" + nodeText(ts.Expression) + "}" + ts.Literal.Text()
		}
		return out, nil
	case ast.IsAsExpression(n), n.Kind == ast.KindTypeAssertionExpression:
		return s.extractStringLiteral(n.Expression())
	case ast.IsBinaryExpression(n) && n.AsBinaryExpression().OperatorToken.Kind == ast.KindPlusToken:
		be := n.AsBinaryExpression()
		return s.concatOperand(be.Left) + s.concatOperand(be.Right), nil
	case ast.IsIdentifier(n):
		if sym := s.c.GetSymbolAtLocation(n); sym != nil && sym.ValueDeclaration != nil &&
			ast.IsVariableDeclaration(sym.ValueDeclaration) && sym.ValueDeclaration.Initializer() != nil {
			return s.extractStringLiteral(sym.ValueDeclaration.Initializer())
		}
	}
	return "", errNotStatic
}

func (s *state) concatOperand(n *ast.Node) string {
	if v, err := s.extractStringLiteral(n); err == nil {
		return v
	}
	inner := n
	if ast.IsParenthesizedExpression(n) {
		inner = n.Expression()
	}
	return "${" + nodeText(inner) + "}"
}

type commonMeta struct {
	disabled                    bool
	title, summary, description *string
	tags                        []string
	errors                      []string
	hasTags, hasErrors          bool
}

func (s *state) getCommonWireMetaData(obj *ast.Node) commonMeta {
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

func (s *state) getPropertyAssignmentInitializer(obj *ast.Node, name string, followShorthand bool) *ast.Node {
	for _, p := range obj.Properties() {
		if ast.IsPropertyAssignment(p) && ast.IsIdentifier(p.Name()) && p.Name().Text() == name {
			return p.Initializer()
		}
		if ast.IsMethodDeclaration(p) && ast.IsIdentifier(p.Name()) && p.Name().Text() == name {
			return p.Name()
		}
		if followShorthand && ast.IsShorthandPropertyAssignment(p) && p.Name().Text() == name {
			sym := s.resolveAlias(s.c.GetShorthandAssignmentValueSymbol(p))
			decl := firstDecl(sym)
			if decl != nil && ast.IsVariableDeclaration(decl) && decl.Initializer() != nil {
				init := decl.Initializer()
				if isFunctionLike(init) || ast.IsCallExpression(init) {
					return init
				}
			}
			if decl != nil && (ast.IsFunctionDeclaration(decl) || isFunctionLike(decl)) {
				return decl
			}
			return p.Name()
		}
	}
	return nil
}

func (s *state) resolveFunctionDeclaration(n *ast.Node) *ast.Node {
	if ast.IsFunctionDeclaration(n) || isFunctionLike(n) {
		return n
	}
	if ast.IsCallExpression(n) && len(n.Arguments()) > 0 {
		if a := n.Arguments()[0]; isFunctionLike(a) {
			return a
		}
	}
	if ast.IsIdentifier(n) {
		sym := s.c.GetSymbolAtLocation(n)
		if sym == nil {
			return nil
		}
		decl := sym.ValueDeclaration
		if decl == nil {
			decl = firstDecl(sym)
		}
		if decl == nil {
			return nil
		}
		if ast.IsImportSpecifier(decl) {
			if aliased := s.c.GetAliasedSymbol(sym); aliased != nil {
				ad := aliased.ValueDeclaration
				if ad == nil {
					ad = firstDecl(aliased)
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

func (s *state) extractFunctionNode(firstArg *ast.Node) (funcNode, resolved *ast.Node, isDirect bool) {
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
		if sym := s.c.GetSymbolAtLocation(funcNode); sym != nil {
			decl := sym.ValueDeclaration
			if decl == nil {
				decl = firstDecl(sym)
			}
			if decl != nil && ast.IsVariableDeclaration(decl) && decl.Initializer() != nil {
				funcNode = decl.Initializer()
			}
		}
	}
	return funcNode, s.resolveFunctionDeclaration(funcNode), isDirect
}

func bindingNames(param *ast.Node) []string {
	var out []string
	for _, e := range param.Name().Elements() {
		pn := e.PropertyName()
		switch {
		case pn != nil && ast.IsIdentifier(pn):
			out = append(out, pn.Text())
		case e.Name() != nil && ast.IsIdentifier(e.Name()):
			out = append(out, e.Name().Text())
		}
	}
	return out
}

func paramAt(fn *ast.Node, i int) *ast.Node {
	ps := fn.Parameters()
	if i < len(ps) {
		return ps[i]
	}
	return nil
}

func extractUsedWires(fn *ast.Node, idx int) WiresMeta {
	p := paramAt(fn, idx)
	if p != nil && ast.IsObjectBindingPattern(p.Name()) {
		w := bindingNames(p)
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

func unwrapNonNullParens(n *ast.Node) *ast.Node {
	for ast.IsNonNullExpression(n) || ast.IsParenthesizedExpression(n) {
		n = n.Expression()
	}
	return n
}

func isRpcExpr(n *ast.Node) bool {
	inner := unwrapNonNullParens(n)
	if ast.IsIdentifier(inner) {
		return inner.Text() == "rpc"
	}
	return ast.IsPropertyAccessExpression(inner) && inner.Name().Text() == "rpc"
}

func walkSelf(n *ast.Node, visit func(*ast.Node)) {
	visit(n)
	walk(n, visit)
}

func sortedKeys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func collectInvokedRpcNames(body *ast.Node) []string {
	names := map[string]bool{}
	walkSelf(body, func(n *ast.Node) {
		if !ast.IsCallExpression(n) || !ast.IsPropertyAccessExpression(n.Expression()) {
			return
		}
		pa := n.Expression()
		m := pa.Name().Text()
		if (m == "invoke" || m == "remote") && isRpcExpr(pa.Expression()) {
			if args := n.Arguments(); len(args) > 0 && (ast.IsStringLiteral(args[0]) || ast.IsNoSubstitutionTemplateLiteral(args[0])) {
				names[args[0].Text()] = true
			}
		}
	})
	return sortedKeys(names)
}

func collectStartedWorkflows(body *ast.Node) []string {
	names := map[string]bool{}
	walkSelf(body, func(n *ast.Node) {
		if !ast.IsCallExpression(n) {
			return
		}
		callee := n.Expression()
		if ast.IsPropertyAccessExpression(callee) && isRpcExpr(callee.Expression()) && callee.Name().Text() == "startWorkflow" {
			if args := n.Arguments(); len(args) > 0 && (ast.IsStringLiteral(args[0]) || ast.IsNoSubstitutionTemplateLiteral(args[0])) {
				names[args[0].Text()] = true
			}
		}
	})
	return sortedKeys(names)
}

func (s *state) refId(n *ast.Node) string {
	return s.extractFunctionName(n).pikkuFuncId
}

func (s *state) resolveMiddleware(obj *ast.Node, tags []string) []WireRef {
	var out []WireRef
	for _, t := range tags {
		if s.tagMiddleware[t] {
			out = append(out, WireRef{Type: "tag", Tag: t})
		}
	}
	if p := findPropertyAssignment(obj, "middleware"); p != nil && ast.IsArrayLiteralExpression(p.Initializer()) {
		for _, e := range p.Initializer().Elements() {
			var id string
			switch {
			case ast.IsIdentifier(e):
				id = s.refId(e)
				if len(id) > 7 && id[:7] == "__temp_" {
					id = e.Text()
				}
			case ast.IsCallExpression(e):
				id = s.refId(e.Expression())
				if len(id) > 7 && id[:7] == "__temp_" && ast.IsIdentifier(e.Expression()) {
					id = e.Expression().Text()
				}
			default:
				continue
			}
			def, ok := s.middlewareDefs[id]
			out = append(out, WireRef{Type: "wire", Name: id, Inline: boolPtr(ok && !def.exported)})
		}
	}
	return out
}

func (s *state) resolvePermissions(obj *ast.Node) []WireRef {
	p := findPropertyAssignment(obj, "permissions")
	if p == nil {
		return nil
	}
	var names []string
	var extract func(e *ast.Node)
	extract = func(e *ast.Node) {
		switch {
		case ast.IsIdentifier(e):
			names = append(names, s.refId(e))
		case ast.IsCallExpression(e):
			names = append(names, s.refId(e.Expression()))
		case ast.IsArrayLiteralExpression(e):
			for _, x := range e.Elements() {
				extract(x)
			}
		}
	}
	node := p.Initializer()
	if ast.IsArrayLiteralExpression(node) {
		for _, e := range node.Elements() {
			extract(e)
		}
	} else if ast.IsObjectLiteralExpression(node) {
		for _, prop := range node.Properties() {
			if ast.IsPropertyAssignment(prop) {
				extract(prop.Initializer())
			} else if ast.IsShorthandPropertyAssignment(prop) {
				extract(prop.Name())
			}
		}
	}
	var out []WireRef
	for _, n := range names {
		def, ok := s.permissionDefs[n]
		out = append(out, WireRef{Type: "wire", Name: n, Inline: boolPtr(ok && !def.exported)})
	}
	return out
}
