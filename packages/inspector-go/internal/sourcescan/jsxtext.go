package sourcescan

import (
	"regexp"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/core"
)

// JsxLiteralText is one piece of literal text a component renders.
type JsxLiteralText struct {
	Text string `json:"text"`
	Line int    `json:"line"`
}

var textAttributes = map[string]bool{
	"placeholder": true, "title": true, "alt": true, "aria-label": true,
	"label": true, "description": true,
}

var textProperties = func() map[string]bool {
	m := map[string]bool{
		"text": true, "body": true, "why": true, "hint": true, "caption": true,
		"heading": true, "subtitle": true, "message": true, "tooltip": true,
	}
	for k := range textAttributes {
		m[k] = true
	}
	return m
}()

var nonTextAttributes = map[string]bool{
	"className": true, "class": true, "style": true, "d": true, "viewBox": true,
	"preserveAspectRatio": true, "points": true, "transform": true, "fill": true,
	"stroke": true, "href": true, "src": true, "rel": true, "target": true,
	"role": true, "to": true, "id": true, "name": true, "type": true,
	"value": true, "key": true,
}

const ws = `[` + jsWhitespace + `]`
const nonWs = `[^` + jsWhitespace + `]`

var (
	// /^\p{Lu}[^\s]*(\s+[^\s]+)+/u
	proseRe = regexp.MustCompile(`^\p{Lu}` + nonWs + `*` + ws + `+` + nonWs)
	// /[:/[\]=_#]/
	proseFirstWordRe = regexp.MustCompile(`[:/\[\]=_#]`)
	// /\p{L}+\s+\p{L}+/u
	sentenceRe = regexp.MustCompile(`\p{L}` + ws + `+\p{L}`)
	letterRe   = regexp.MustCompile(`\p{L}`)
)

func isProse(text string) bool {
	first := text
	if i := strings.IndexFunc(text, isJSWhitespace); i >= 0 {
		first = text[:i]
	}
	return proseRe.MatchString(jsTrim(text)) && !proseFirstWordRe.MatchString(first)
}

func isSentence(text string) bool { return sentenceRe.MatchString(text) }

func hasLetter(text string) bool { return letterRe.MatchString(text) }

func isStringLiteralLike(n *ast.Node) bool {
	return n != nil && (ast.IsStringLiteral(n) || ast.IsNoSubstitutionTemplateLiteral(n))
}

// rendered is the literals an expression can evaluate to and render.
func rendered(n *ast.Node) []*ast.Node {
	switch {
	case isStringLiteralLike(n):
		return []*ast.Node{n}
	case ast.IsParenthesizedExpression(n):
		return rendered(n.Expression())
	case ast.IsConditionalExpression(n):
		c := n.AsConditionalExpression()
		return append(rendered(c.WhenTrue), rendered(c.WhenFalse)...)
	case ast.IsBinaryExpression(n):
		b := n.AsBinaryExpression()
		switch b.OperatorToken.Kind {
		case ast.KindAmpersandAmpersandToken:
			return rendered(b.Right)
		case ast.KindBarBarToken, ast.KindQuestionQuestionToken:
			return append(rendered(b.Left), rendered(b.Right)...)
		}
	}
	return nil
}

// ReadJsxLiteralText ports utils/read-jsx-literal-text.ts. The file is always
// parsed as TSX, whatever its extension.
func ReadJsxLiteralText(fileName, content string) []JsxLiteralText {
	sf := Parse(fileName, content, core.ScriptKindTSX)
	found := []JsxLiteralText{}
	seen := map[int]bool{}
	add := func(n *ast.Node, text string) {
		if !hasLetter(text) {
			return
		}
		pos := start(n, sf)
		if seen[pos] {
			return
		}
		seen[pos] = true
		found = append(found, JsxLiteralText{Text: jsTrim(text), Line: lineOf(sf, pos)})
	}
	var visit func(n *ast.Node)
	visit = func(n *ast.Node) {
		parent := n.Parent
		switch {
		case n.Kind == ast.KindJsxText:
			add(n, n.AsJsxText().Text)
		case n.Kind == ast.KindJsxExpression && n.Expression() != nil &&
			parent != nil && (ast.IsJsxElement(parent) || ast.IsJsxFragment(parent)):
			for _, literal := range rendered(n.Expression()) {
				add(literal, literal.Text())
			}
		case n.Kind == ast.KindJsxAttribute && n.Initializer() != nil:
			name := getText(n.Name(), sf)
			value := n.Initializer()
			if value.Kind == ast.KindJsxExpression {
				value = value.Expression()
			}
			if isStringLiteralLike(value) &&
				(textAttributes[name] ||
					(!nonTextAttributes[name] && !strings.HasPrefix(name, "data-") && isSentence(value.Text()))) {
				add(value, value.Text())
			}
		case n.Kind == ast.KindPropertyAssignment &&
			textProperties[getText(n.Name(), sf)] && isStringLiteralLike(n.Initializer()):
			add(n.Initializer(), n.Initializer().Text())
		}
		if isStringLiteralLike(n) && isProse(n.Text()) && parent != nil &&
			!ast.IsImportDeclaration(parent) &&
			!ast.IsExportDeclaration(parent) &&
			!ast.IsLiteralTypeNode(parent) &&
			!(ast.IsPropertyAssignment(parent) && parent.Name() == n) &&
			!(ast.IsJsxAttribute(parent) && nonTextAttributes[getText(parent.Name(), sf)]) {
			add(n, n.Text())
		}
		forEachChild(n, visit)
	}
	visit(sf.AsNode())
	return found
}
