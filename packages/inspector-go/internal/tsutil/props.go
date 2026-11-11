package tsutil

import (
	"strconv"

	"github.com/microsoft/typescript-go/shim/ast"
)

func FindPropertyAssignment(obj *ast.Node, name string) *ast.Node {
	for _, p := range obj.Properties() {
		if ast.IsPropertyAssignment(p) && ast.IsIdentifier(p.Name()) && p.Name().Text() == name {
			return p
		}
	}
	return nil
}

func UnwrapAs(n *ast.Node) *ast.Node {
	for ast.IsAsExpression(n) || ast.IsSatisfiesExpression(n) {
		n = n.Expression()
	}
	return n
}

func FoldStaticString(n *ast.Node) (string, bool) {
	switch {
	case ast.IsStringLiteral(n) || ast.IsNoSubstitutionTemplateLiteral(n):
		return n.Text(), true
	case ast.IsParenthesizedExpression(n), ast.IsAsExpression(n), n.Kind == ast.KindTypeAssertionExpression:
		return FoldStaticString(n.Expression())
	case ast.IsBinaryExpression(n):
		be := n.AsBinaryExpression()
		if be.OperatorToken.Kind != ast.KindPlusToken {
			return "", false
		}
		l, ok := FoldStaticString(be.Left)
		if !ok {
			return "", false
		}
		r, ok := FoldStaticString(be.Right)
		if !ok {
			return "", false
		}
		return l + r, true
	}
	return "", false
}

// PropValue is the union GetPropertyValue returns: string | string[] | number | boolean | null.
type PropValue struct {
	Present bool
	Str     *string
	Strs    []string
	Num     *float64
	Bool    *bool
}

func GetPropertyValue(obj *ast.Node, name string) PropValue {
	p := FindPropertyAssignment(obj, name)
	if p == nil {
		return PropValue{}
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
			return PropValue{}
		}
		return PropValue{Present: true, Strs: out}
	}
	switch init.Kind {
	case ast.KindTrueKeyword:
		return PropValue{Present: true, Bool: BoolPtr(true)}
	case ast.KindFalseKeyword:
		return PropValue{Present: true, Bool: BoolPtr(false)}
	}
	if ast.IsNumericLiteral(init) {
		if name == "name" || name == "schedule" {
			return PropValue{Present: true, Str: StrPtr(init.Text())}
		}
		f, _ := strconv.ParseFloat(init.Text(), 64)
		return PropValue{Present: true, Num: &f}
	}
	if s, ok := FoldStaticString(init); ok {
		return PropValue{Present: true, Str: &s}
	}
	t := NodeText(init)
	return PropValue{Present: true, Str: &t}
}

// truthyBool mirrors `GetPropertyValue(...) as boolean | undefined` followed by `|| undefined`.
func (v PropValue) Truthy() bool {
	switch {
	case v.Bool != nil:
		return *v.Bool
	case v.Str != nil:
		return *v.Str != ""
	case v.Num != nil:
		return *v.Num != 0
	case v.Strs != nil:
		return true
	}
	return false
}

func (v PropValue) AsString() string {
	if v.Str != nil {
		return *v.Str
	}
	return ""
}

func GetArrayPropertyValue(obj *ast.Node, name string) ([]string, bool) {
	p := FindPropertyAssignment(obj, name)
	if p == nil {
		return nil, false
	}
	init := UnwrapAs(p.Initializer())
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

func BindingNames(param *ast.Node) []string {
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

func ParamAt(fn *ast.Node, i int) *ast.Node {
	ps := fn.Parameters()
	if i < len(ps) {
		return ps[i]
	}
	return nil
}

func UnwrapNonNullParens(n *ast.Node) *ast.Node {
	for ast.IsNonNullExpression(n) || ast.IsParenthesizedExpression(n) {
		n = n.Expression()
	}
	return n
}

func IsRpcExpr(n *ast.Node) bool {
	inner := UnwrapNonNullParens(n)
	if ast.IsIdentifier(inner) {
		return inner.Text() == "rpc"
	}
	return ast.IsPropertyAccessExpression(inner) && inner.Name().Text() == "rpc"
}
