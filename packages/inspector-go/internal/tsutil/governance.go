package tsutil

import (
	"math"
	"regexp"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
)

// Ports of utils/literal-properties.ts: readers for object-literal properties
// that must be statically knowable. Each returns ok=false for a computed value.

// LiteralProperty is literal-properties.ts getProperty: the initializer of a
// property assignment whose name is an identifier or a string literal.
func LiteralProperty(obj *ast.Node, name string) *ast.Node {
	for _, p := range obj.Properties() {
		if !ast.IsPropertyAssignment(p) {
			continue
		}
		if k := p.Name(); (ast.IsIdentifier(k) || ast.IsStringLiteral(k)) && k.Text() == name {
			return p.Initializer()
		}
	}
	return nil
}

// LiteralString is stringProperty.
func LiteralString(obj *ast.Node, name string) (string, bool) {
	v := LiteralProperty(obj, name)
	if v != nil && ast.IsStringLiteralLike(v) {
		return v.Text(), true
	}
	return "", false
}

// LiteralNumber is numberProperty: a numeric literal, or `-` over one.
func LiteralNumber(obj *ast.Node, name string) (float64, bool) {
	v := LiteralProperty(obj, name)
	if v == nil {
		return 0, false
	}
	return NumericValue(v)
}

// NumericValue reads a numeric literal or a unary minus over one as
// `Number(text)` / `-Number(text)`.
func NumericValue(v *ast.Node) (float64, bool) {
	if ast.IsPrefixUnaryExpression(v) {
		pu := v.AsPrefixUnaryExpression()
		if pu.Operator == ast.KindMinusToken && ast.IsNumericLiteral(pu.Operand) {
			return -JSNumber(pu.Operand.Text()), true
		}
		return 0, false
	}
	if ast.IsNumericLiteral(v) {
		return JSNumber(v.Text()), true
	}
	return 0, false
}

// LiteralBool is booleanProperty.
func LiteralBool(obj *ast.Node, name string) (bool, bool) {
	v := LiteralProperty(obj, name)
	if v == nil {
		return false, false
	}
	switch v.Kind {
	case ast.KindTrueKeyword:
		return true, true
	case ast.KindFalseKeyword:
		return false, true
	}
	return false, false
}

// LiteralStringArray is stringArrayProperty: all-or-nothing.
func LiteralStringArray(obj *ast.Node, name string) ([]string, bool) {
	v := LiteralProperty(obj, name)
	if v == nil || !ast.IsArrayLiteralExpression(v) {
		return nil, false
	}
	out := []string{}
	for _, e := range v.Elements() {
		if !ast.IsStringLiteralLike(e) {
			return nil, false
		}
		out = append(out, e.Text())
	}
	return out, true
}

// JSNumber is `Number(text)` for a numeric literal's text.
func JSNumber(text string) float64 {
	t := strings.ReplaceAll(text, "_", "")
	if len(t) > 2 && t[0] == '0' {
		switch t[1] {
		case 'x', 'X', 'o', 'O', 'b', 'B':
			if n, err := strconv.ParseUint(t, 0, 64); err == nil {
				return float64(n)
			}
		}
	}
	f, err := strconv.ParseFloat(t, 64)
	if err != nil && !math.IsInf(f, 0) {
		return math.NaN()
	}
	return f
}

// JSNumberString is String(n) for a JS number.
func JSNumberString(f float64) string {
	switch {
	case math.IsNaN(f):
		return "NaN"
	case math.IsInf(f, 1):
		return "Infinity"
	case math.IsInf(f, -1):
		return "-Infinity"
	case f == 0:
		return "0"
	}
	abs := math.Abs(f)
	if abs >= 1e21 || abs < 1e-6 {
		s := strconv.FormatFloat(f, 'e', -1, 64)
		// Go writes 1e+21 / 1e-07; JS writes 1e+21 / 1e-7.
		mant, exp, _ := strings.Cut(s, "e")
		sign := exp[0]
		exp = strings.TrimLeft(exp[1:], "0")
		return mant + "e" + string(sign) + exp
	}
	return strconv.FormatFloat(f, 'f', -1, 64)
}

// jsWhitespace is JS's `\s`.
var jsWhitespace = regexp.MustCompile(`[\t\n\v\f\r \x{00A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}]+`)

// CollapseWhitespace is `s.replace(/\s+/g, ' ')`.
func CollapseWhitespace(s string) string { return jsWhitespace.ReplaceAllString(s, " ") }
