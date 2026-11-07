package sourcescan

import (
	"regexp"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/core"
	"github.com/microsoft/typescript-go/shim/jsnum"
	"github.com/microsoft/typescript-go/shim/scanner"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// JsxStyleError is raised when an element's className cannot be edited safely;
// the TypeScript side rethrows it as code-edit's JsxStyleError.
type JsxStyleError struct{ Message string }

func (e *JsxStyleError) Error() string { return e.Message }

// JsxProp is one literal prop of an element, in source order.
type JsxProp struct {
	Name  string `json:"name"`
	Value any    `json:"value"`
}

// StyleEntry is one entry of the styles object writeJsxStyle takes, in the
// order the caller listed them; a nil Value removes the property.
type StyleEntry struct {
	Prop  string  `json:"prop"`
	Value *string `json:"value"`
}

func parseTSX(source string) *ast.SourceFile {
	return Parse("x.tsx", source, core.ScriptKindTSX)
}

func isOpeningLike(n *ast.Node) bool {
	return ast.IsJsxOpeningElement(n) || ast.IsJsxSelfClosingElement(n)
}

func jsxAttributes(element *ast.Node) []*ast.Node {
	return element.Attributes().AsJsxAttributes().Properties.Nodes
}

// findOpeningElement is jsx-props.ts findOpeningElement: the first opening or
// self-closing element starting at 1-based line, 0-based UTF-16 column.
func findOpeningElement(sf *ast.SourceFile, line, col int) *ast.Node {
	text := sf.Text()
	lineStarts := scanner.GetECMALineStarts(sf)
	var found *ast.Node
	var visit func(n *ast.Node)
	visit = func(n *ast.Node) {
		if found != nil {
			return
		}
		if isOpeningLike(n) {
			at := start(n, sf)
			idx := scanner.GetECMALineOfPosition(sf, at)
			column := tsutil.UTF16Offset(text, at) - tsutil.UTF16Offset(text, int(lineStarts[idx]))
			if idx+1 == line && column == col {
				found = n
				return
			}
		}
		forEachChild(n, visit)
	}
	visit(sf.AsNode())
	return found
}

// literalValue is jsx-props.ts literalValue; ok is false for "undefined".
func literalValue(attr *ast.Node) (value any, ok bool) {
	init := attr.AsJsxAttribute().Initializer
	if init == nil {
		return true, true
	}
	if ast.IsStringLiteral(init) {
		return init.Text(), true
	}
	if !ast.IsJsxExpression(init) || init.Expression() == nil {
		return nil, false
	}
	expr := init.Expression()
	switch {
	case ast.IsStringLiteral(expr), ast.IsNoSubstitutionTemplateLiteral(expr):
		return expr.Text(), true
	case ast.IsNumericLiteral(expr):
		return float64(jsnum.FromString(expr.Text())), true
	case expr.Kind == ast.KindTrueKeyword:
		return true, true
	case expr.Kind == ast.KindFalseKeyword:
		return false, true
	}
	return nil, false
}

func jsQuote(s string) string {
	return strings.ReplaceAll(strings.ReplaceAll(s, `\`, `\\`), `"`, `\"`)
}

func attrText(name string, value any) string {
	switch v := value.(type) {
	case bool:
		if v {
			return name
		}
		return name + "={false}"
	case float64:
		return name + "={" + jsnum.Number(v).String() + "}"
	case string:
		return name + `="` + jsQuote(v) + `"`
	}
	return name
}

// ReadJsxProps ports readJsxProps; nil when no element starts there.
func ReadJsxProps(source string, line, col int) []JsxProp {
	sf := parseTSX(source)
	element := findOpeningElement(sf, line, col)
	if element == nil {
		return nil
	}
	props := []JsxProp{}
	for _, attr := range jsxAttributes(element) {
		if !ast.IsJsxAttribute(attr) || !ast.IsIdentifier(attr.Name()) {
			continue
		}
		if value, ok := literalValue(attr); ok {
			props = append(props, JsxProp{Name: attr.Name().Text(), Value: value})
		}
	}
	return props
}

var styleTokenRe = regexp.MustCompile(`^\[([a-z-]+):(.+)\]!$`)

func kebab(prop string) string {
	var b strings.Builder
	for _, r := range prop {
		if r >= 'A' && r <= 'Z' {
			b.WriteByte('-')
			b.WriteRune(r + ('a' - 'A'))
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func restyle(classes string, styles []StyleEntry) string {
	props := map[string]bool{}
	for _, s := range styles {
		props[kebab(s.Prop)] = true
	}
	kept := []string{}
	for _, token := range jsWhitespaceRun.Split(classes, -1) {
		match := styleTokenRe.FindStringSubmatch(token)
		if token != "" && !(match != nil && props[match[1]]) {
			kept = append(kept, token)
		}
	}
	for _, s := range styles {
		if s.Value == nil || jsTrim(*s.Value) == "" {
			continue
		}
		value := jsWhitespaceRun.ReplaceAllString(jsTrim(*s.Value), "_")
		kept = append(kept, "["+kebab(s.Prop)+":"+value+"]!")
	}
	return strings.Join(kept, " ")
}

func onlyStyleTokens(text string) bool {
	trimmed := jsTrim(text)
	if trimmed == "" {
		return false
	}
	for _, t := range jsWhitespaceRun.Split(trimmed, -1) {
		if !styleTokenRe.MatchString(t) {
			return false
		}
	}
	return true
}

func quoted(text string) string { return `"` + jsQuote(text) + `"` }

func findAttr(element *ast.Node, name string) *ast.Node {
	for _, a := range jsxAttributes(element) {
		if ast.IsJsxAttribute(a) && ast.IsIdentifier(a.Name()) && a.Name().Text() == name {
			return a
		}
	}
	return nil
}

// WriteJsxStyle ports writeJsxStyle.
func WriteJsxStyle(source string, line, col int, styles []StyleEntry) (string, error) {
	sf := parseTSX(source)
	element := findOpeningElement(sf, line, col)
	if element == nil {
		return source, nil
	}
	attr := findAttr(element, "className")
	var value any = ""
	if attr != nil {
		value, _ = literalValue(attr)
	}
	if current, ok := value.(string); ok {
		next := restyle(current, styles)
		if next == current {
			return source, nil
		}
		var prop any
		if next != "" {
			prop = next
		}
		return WriteJsxProp(source, line, col, "className", prop), nil
	}
	var expr *ast.Node
	if attr != nil {
		if init := attr.AsJsxAttribute().Initializer; init != nil && ast.IsJsxExpression(init) {
			expr = init.Expression()
		}
	}
	if expr == nil || !ast.IsCallExpression(expr) || !ast.IsIdentifier(expr.Expression()) || expr.Expression().Text() != "cn" {
		return "", &JsxStyleError{Message: "This element builds its className in a way that cannot be edited safely"}
	}
	args := expr.AsCallExpression().Arguments
	var last, prev *ast.Node
	if n := len(args.Nodes); n > 0 {
		last = args.Nodes[n-1]
		if n > 1 {
			prev = args.Nodes[n-2]
		}
	}
	if last != nil && isStringLiteralLike(last) && onlyStyleTokens(last.Text()) {
		if next := restyle(last.Text(), styles); next != "" {
			return source[:start(last, sf)] + quoted(next) + source[last.End():], nil
		}
		if prev != nil {
			return source[:prev.End()] + source[last.End():], nil
		}
		return source[:args.Pos()] + source[args.End():], nil
	}
	added := restyle("", styles)
	if added == "" {
		return source, nil
	}
	at := args.End()
	sep := ""
	if last != nil {
		at = last.End()
		sep = ", "
	}
	return source[:at] + sep + quoted(added) + source[at:], nil
}

// WriteJsxProp ports writeJsxProp; value is a string, float64, bool, or nil to remove.
func WriteJsxProp(source string, line, col int, name string, value any) string {
	sf := parseTSX(source)
	element := findOpeningElement(sf, line, col)
	if element == nil {
		return source
	}
	existing := findAttr(element, name)
	if value == nil {
		if existing == nil {
			return source
		}
		at := start(existing, sf)
		for at > 0 && (source[at-1] == ' ' || source[at-1] == '\t') {
			at--
		}
		return source[:at] + source[existing.End():]
	}
	if existing != nil {
		return source[:start(existing, sf)] + attrText(name, value) + source[existing.End():]
	}
	props := element.Attributes().AsJsxAttributes().Properties
	var at int
	switch {
	case len(props.Nodes) > 0:
		at = props.End()
	case jsxTypeArguments(element) != nil:
		at = jsxTypeArguments(element).End()
	default:
		at = element.TagName().End()
	}
	return source[:at] + " " + attrText(name, value) + source[at:]
}

func jsxTypeArguments(element *ast.Node) *ast.NodeList {
	if ast.IsJsxOpeningElement(element) {
		return element.AsJsxOpeningElement().TypeArguments
	}
	return element.AsJsxSelfClosingElement().TypeArguments
}
