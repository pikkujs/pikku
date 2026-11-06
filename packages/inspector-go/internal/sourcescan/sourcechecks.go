package sourcescan

import (
	"fmt"
	"os"
	"regexp"
	"strings"
	"unicode/utf16"
	"unicode/utf8"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/core"
)

// jsText is a string cut by UTF-16 length, as String#slice cuts it. The cut can
// land inside a surrogate pair, which only a JSON escape can carry across.
type jsText []uint16

// sliceJS is s.slice(0, n).
func sliceJS(s string, n int) jsText {
	units := utf16Units(s)
	if len(units) > n {
		units = units[:n]
	}
	return units
}

func (t jsText) MarshalJSON() ([]byte, error) {
	out := []byte{'"'}
	for i := 0; i < len(t); i++ {
		u := t[i]
		switch {
		case u == '"':
			out = append(out, '\\', '"')
		case u == '\\':
			out = append(out, '\\', '\\')
		case u < 0x20:
			out = append(out, []byte(fmt.Sprintf(`\u%04x`, u))...)
		case u >= 0xd800 && u < 0xdc00 && i+1 < len(t) && t[i+1] >= 0xdc00 && t[i+1] < 0xe000:
			out = utf8.AppendRune(out, utf16.DecodeRune(rune(u), rune(t[i+1])))
			i++
		case u >= 0xd800 && u < 0xe000:
			out = append(out, []byte(fmt.Sprintf(`\u%04x`, u))...)
		default:
			out = utf8.AppendRune(out, rune(u))
		}
	}
	return append(out, '"'), nil
}

// SourceHit is verify/source-checks.ts SourceHit.
type SourceHit struct {
	File string `json:"file"`
	Line int    `json:"line"`
	Text jsText `json:"text"`
}

var (
	asI18nSkipFile       = regexp.MustCompile(`\.(stories|test|spec)\.tsx?$`)
	asI18nDefinitionFile = regexp.MustCompile(`(^|/)react/src/i18n-types\.ts$`)
	jsxLiteralSkipFile   = regexp.MustCompile(`\.(stories|test|spec)\.tsx$`)
	reactModule          = regexp.MustCompile(`^@pikku/react(/|$)`)
	reactSourceFile      = regexp.MustCompile(`(^|/)react/src/`)
	reactRelativeModule  = regexp.MustCompile(`^\.{1,2}/(?:` + jsDot + `*/)?(?:i18n-types|index)(?:\.js)?$`)
	letterOrDigit        = regexp.MustCompile(`[\p{L}\p{N}]`)
	sepWord              = regexp.MustCompile(`\bsep\b`)
	copyPropPattern      = regexp.MustCompile(`^(aria-label|aria-description|title|placeholder|alt)$`)
	lowercaseStart       = regexp.MustCompile(`^[a-z]`)
)

func readText(file string) (string, bool) {
	b, err := os.ReadFile(file)
	if err != nil {
		return "", false
	}
	return decodeUTF8(b), true
}

// hitAt is the 1-based line of pos and the trimmed first 160 characters of that
// line, where lines are the text split on "\n" and the line number counts every
// ECMAScript line break.
func hitAt(sf *ast.SourceFile, lines []string, pos int) SourceHit {
	idx := lineOf(sf, pos) - 1
	var text jsText
	if idx < len(lines) {
		text = sliceJS(jsTrim(lines[idx]), 160)
	}
	return SourceHit{Line: idx + 1, Text: text}
}

func unwrapReference(expr *ast.Node) *ast.Node {
	for ast.IsParenthesizedExpression(expr) || ast.IsAsExpression(expr) || ast.IsNonNullExpression(expr) ||
		ast.IsTypeAssertion(expr) || ast.IsSatisfiesExpression(expr) {
		expr = expr.Expression()
	}
	return expr
}

func isPlainReference(expr *ast.Node) bool {
	inner := unwrapReference(expr)
	if ast.IsIdentifier(inner) || inner.Kind == ast.KindThisKeyword {
		return true
	}
	if ast.IsPropertyAccessExpression(inner) {
		return isPlainReference(inner.Expression())
	}
	return false
}

func classifyAsI18nArgument(expr *ast.Node) string {
	inner := unwrapReference(expr)
	switch {
	case ast.IsStringLiteral(inner):
		return "a string literal"
	case ast.IsNoSubstitutionTemplateLiteral(inner), ast.IsTemplateExpression(inner):
		return "a template literal"
	case ast.IsCallExpression(inner):
		return "a call"
	case ast.IsBinaryExpression(inner) && inner.AsBinaryExpression().OperatorToken.Kind == ast.KindPlusToken:
		return "a concatenation"
	}
	return "an expression"
}

// helperNames ports helperNames: the local names a helper is callable by in one
// file, its own name plus every `import { name as x }` alias, minus the plain name
// when the file declares its own (that file is the helper's definition, not a
// caller). Exact identifiers only, so `asI18n` never matches `asI18nStub`.
func helperNames(sf *ast.SourceFile, helper string) map[string]bool {
	names := map[string]bool{helper: true}
	for _, statement := range sf.Statements.Nodes {
		if ast.IsImportDeclaration(statement) {
			clause := statement.AsImportDeclaration().ImportClause
			if clause != nil {
				bindings := clause.AsImportClause().NamedBindings
				if bindings != nil && ast.IsNamedImports(bindings) {
					for _, spec := range bindings.AsNamedImports().Elements.Nodes {
						imported := spec.Name()
						if p := spec.AsImportSpecifier().PropertyName; p != nil {
							imported = p
						}
						if imported.Text() == helper {
							names[spec.Name().Text()] = true
						}
					}
				}
			}
		}
		if ast.IsVariableStatement(statement) {
			for _, decl := range statement.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes {
				if ast.IsIdentifier(decl.Name()) && decl.Name().Text() == helper {
					delete(names, helper)
				}
			}
		}
		if ast.IsFunctionDeclaration(statement) && statement.Name() != nil && statement.Name().Text() == helper {
			delete(names, helper)
		}
	}
	return names
}

func callArguments(call *ast.Node) []*ast.Node {
	args := call.AsCallExpression().Arguments
	if args == nil {
		return nil
	}
	return args.Nodes
}

func isHelperCallee(callee *ast.Node, names map[string]bool, helper string) bool {
	return (ast.IsIdentifier(callee) && names[callee.Text()]) ||
		(ast.IsPropertyAccessExpression(callee) && callee.Name().Text() == helper)
}

// AsI18nArgumentHit is verify/source-checks.ts AsI18nArgumentHit.
type AsI18nArgumentHit struct {
	SourceHit
	Kind string `json:"kind"`
}

// walk visits sf and every node below it.
func walk(sf *ast.SourceFile, visit func(*ast.Node)) {
	var recurse func(*ast.Node)
	recurse = func(n *ast.Node) {
		visit(n)
		forEachChild(n, recurse)
	}
	recurse(sf.AsNode())
}

// FindAsI18nArguments ports asI18nArguments: `asI18n(...)` arguments that are not
// a plain variable reference. The escape hatch brands outside data, so anything
// written in place (a literal, a template, a concatenation, a ternary, a default,
// a call) is copy or computation that skipped the message catalogue. The call is
// recognised by name, through `import { asI18n as x }` and as `ns.asI18n(...)`.
// `.stories`, `.test` and `.spec` files are skipped.
func FindAsI18nArguments(dir string) []AsI18nArgumentHit {
	hits := []AsI18nArgumentHit{}
	for _, file := range SourceFiles(dir, false, true) {
		if asI18nSkipFile.MatchString(file) || asI18nDefinitionFile.MatchString(file) {
			continue
		}
		text, ok := readText(file)
		if !ok || !strings.Contains(text, "asI18n") {
			continue
		}
		sf := parseSourceText(file, text)
		names := helperNames(sf, "asI18n")
		lines := strings.Split(text, "\n")
		walk(sf, func(node *ast.Node) {
			if !ast.IsCallExpression(node) || !isHelperCallee(node.Expression(), names, "asI18n") {
				return
			}
			args := callArguments(node)
			if len(args) == 0 || isPlainReference(args[0]) {
				return
			}
			arg := args[0]
			hit := hitAt(sf, lines, start(arg, sf))
			hit.File = file
			kind := "an expression"
			if !ast.IsSpreadElement(arg) {
				kind = classifyAsI18nArgument(arg)
			}
			hits = append(hits, AsI18nArgumentHit{SourceHit: hit, Kind: kind})
		})
	}
	return hits
}

// AsI18nStubHit is verify/source-checks.ts AsI18nStubHit.
type AsI18nStubHit struct {
	SourceHit
	Copy jsText `json:"copy"`
}

// FindAsI18nStubs ports asI18nStubs: every `asI18nStub(...)` call, recognised by
// name, through `import { asI18nStub as x }` and as `ns.asI18nStub(...)`. The
// definition file, `.stories`, `.test` and `.spec` files are skipped.
func FindAsI18nStubs(dir string) []AsI18nStubHit {
	hits := []AsI18nStubHit{}
	for _, file := range SourceFiles(dir, false, true) {
		if asI18nSkipFile.MatchString(file) || asI18nDefinitionFile.MatchString(file) {
			continue
		}
		text, ok := readText(file)
		if !ok || !strings.Contains(text, "asI18nStub") {
			continue
		}
		sf := parseSourceText(file, text)
		names := helperNames(sf, "asI18nStub")
		lines := strings.Split(text, "\n")
		walk(sf, func(node *ast.Node) {
			if !ast.IsCallExpression(node) || !isHelperCallee(node.Expression(), names, "asI18nStub") {
				return
			}
			copy := ""
			if args := callArguments(node); len(args) > 0 {
				if isStringLiteralLike(args[0]) {
					copy = args[0].Text()
				} else {
					copy = getText(args[0], sf)
				}
			}
			hit := hitAt(sf, lines, start(node, sf))
			hit.File = file
			hits = append(hits, AsI18nStubHit{SourceHit: hit, Copy: sliceJS(normalizeWhitespace(copy), 60)})
		})
	}
	return hits
}

// SepArgumentHit is verify/source-checks.ts SepArgumentHit.
type SepArgumentHit struct {
	SourceHit
	Reason string `json:"reason"`
}

// importedHelperBindings ports importedHelperBindings: the local names helper is
// callable by in one file, counting only bindings imported from `@pikku/react`
// (or, inside the react package's source, from its own `i18n-types` / `index`),
// plus the local names of namespace imports from there. A same-named function
// from anywhere else, or declared in the file, is not it.
func importedHelperBindings(sf *ast.SourceFile, helper, file string) (names, namespaces map[string]bool) {
	names, namespaces = map[string]bool{}, map[string]bool{}
	inReactSource := reactSourceFile.MatchString(file)
	for _, statement := range sf.Statements.Nodes {
		if !ast.IsImportDeclaration(statement) {
			continue
		}
		decl := statement.AsImportDeclaration()
		if !ast.IsStringLiteral(decl.ModuleSpecifier) {
			continue
		}
		spec := decl.ModuleSpecifier.Text()
		if !reactModule.MatchString(spec) && !(inReactSource && reactRelativeModule.MatchString(spec)) {
			continue
		}
		if decl.ImportClause == nil {
			continue
		}
		bindings := decl.ImportClause.AsImportClause().NamedBindings
		if bindings == nil {
			continue
		}
		if ast.IsNamespaceImport(bindings) {
			namespaces[bindings.Name().Text()] = true
			continue
		}
		for _, el := range bindings.AsNamedImports().Elements.Nodes {
			imported := el.Name()
			if p := el.AsImportSpecifier().PropertyName; p != nil {
				imported = p
			}
			if imported.Text() == helper {
				names[el.Name().Text()] = true
			}
		}
	}
	return names, namespaces
}

// FindSepArguments ports sepArguments: `sep(...)` calls whose argument is not a
// non-empty string literal (or no-substitution template) made only of whitespace,
// punctuation and symbols. Only calls whose binding is imported from
// `@pikku/react` count (named import, alias, or `ns.sep(...)` on a namespace
// import), so a local `sep` or one from another library is left alone, and
// `separate`, `asI18nSep` and `sepFoo` never match.
func FindSepArguments(dir string) []SepArgumentHit {
	hits := []SepArgumentHit{}
	for _, file := range SourceFiles(dir, false, true) {
		if asI18nSkipFile.MatchString(file) || asI18nDefinitionFile.MatchString(file) {
			continue
		}
		text, ok := readText(file)
		if !ok || !sepWord.MatchString(text) {
			continue
		}
		sf := parseSourceText(file, text)
		names, namespaces := importedHelperBindings(sf, "sep", file)
		if len(names) == 0 && len(namespaces) == 0 {
			continue
		}
		lines := strings.Split(text, "\n")
		walk(sf, func(node *ast.Node) {
			if !ast.IsCallExpression(node) {
				return
			}
			callee := node.Expression()
			isSep := (ast.IsIdentifier(callee) && names[callee.Text()]) ||
				(ast.IsPropertyAccessExpression(callee) && callee.Name().Text() == "sep" &&
					ast.IsIdentifier(callee.Expression()) && namespaces[callee.Expression().Text()])
			if !isSep {
				return
			}
			var inner *ast.Node
			if args := callArguments(node); len(args) > 0 && !ast.IsSpreadElement(args[0]) {
				inner = unwrapReference(args[0])
			}
			reason := ""
			switch {
			case inner == nil || !isStringLiteralLike(inner):
				reason = "not a string literal"
			case inner.Text() == "":
				reason = "empty"
			case letterOrDigit.MatchString(inner.Text()):
				reason = "contains a letter or digit"
			}
			if reason != "" {
				hit := hitAt(sf, lines, start(node, sf))
				hit.File = file
				hits = append(hits, SepArgumentHit{SourceHit: hit, Reason: reason})
			}
		})
	}
	return hits
}

func isIntrinsicTag(tag *ast.Node) bool {
	return ast.IsIdentifier(tag) && lowercaseStart.MatchString(tag.Text())
}

// owningTag is the tag of the element a child (JsxText or JsxExpression) or an
// attribute belongs to, nil for a fragment.
func owningTag(node *ast.Node) *ast.Node {
	parent := node.Parent
	if ast.IsJsxElement(parent) {
		return parent.AsJsxElement().OpeningElement.TagName()
	}
	if ast.IsJsxAttributes(parent) {
		return parent.Parent.TagName()
	}
	return nil
}

func isElementOrFragment(n *ast.Node) bool {
	return ast.IsJsxElement(n) || ast.IsJsxFragment(n)
}

// FindJsxLiteralText ports jsxLiteralText: bare JSX text and string literals in a
// child expression, ignoring texts with no letter and the allowed strings. With
// gated, the children of lowercase DOM and SVG elements are left to the type gate.
func FindJsxLiteralText(dir string, allowed []string, gated bool) []SourceHit {
	hits := []SourceHit{}
	for _, file := range SourceFiles(dir, false, false) {
		if !strings.HasSuffix(file, ".tsx") || jsxLiteralSkipFile.MatchString(file) {
			continue
		}
		text, ok := readText(file)
		if !ok || text == "" {
			continue
		}
		sf := Parse(file, text, core.ScriptKindTSX)
		report := func(node *ast.Node, value string) {
			if tag := owningTag(node); gated && tag != nil && isIntrinsicTag(tag) {
				return
			}
			trimmed := normalizeWhitespace(value)
			if trimmed == "" || contains(allowed, trimmed) || !copyLetterRe.MatchString(trimmed) {
				return
			}
			hits = append(hits, SourceHit{File: file, Line: lineOf(sf, start(node, sf)), Text: sliceJS(trimmed, 160)})
		}
		walk(sf, func(node *ast.Node) {
			if node.Kind == ast.KindJsxText {
				report(node, node.AsJsxText().Text)
			} else if ast.IsJsxExpression(node) && node.Expression() != nil && isElementOrFragment(node.Parent) &&
				isStringLiteralLike(node.Expression()) {
				report(node, node.Expression().Text())
			}
		})
	}
	return hits
}

// literalStrings ports literalStrings: the literal strings an expression can
// evaluate to directly.
func literalStrings(expr *ast.Node) []string {
	switch {
	case ast.IsParenthesizedExpression(expr), ast.IsAsExpression(expr):
		return literalStrings(expr.Expression())
	case isStringLiteralLike(expr):
		return []string{expr.Text()}
	case ast.IsTemplateExpression(expr):
		return []string{templateText(expr)}
	case ast.IsConditionalExpression(expr):
		c := expr.AsConditionalExpression()
		return append(literalStrings(c.WhenTrue), literalStrings(c.WhenFalse)...)
	case ast.IsBinaryExpression(expr):
		b := expr.AsBinaryExpression()
		switch b.OperatorToken.Kind {
		case ast.KindBarBarToken, ast.KindQuestionQuestionToken:
			return append(literalStrings(b.Left), literalStrings(b.Right)...)
		case ast.KindAmpersandAmpersandToken:
			return literalStrings(b.Right)
		}
	}
	return nil
}

// templateText is the template's head text followed by `{…}` and the literal
// text of each span.
func templateText(template *ast.Node) string {
	t := template.AsTemplateExpression()
	var b strings.Builder
	b.WriteString(t.Head.Text())
	for _, span := range t.TemplateSpans.Nodes {
		b.WriteString("{…}")
		b.WriteString(span.AsTemplateSpan().Literal.Text())
	}
	return b.String()
}

func ownedByGate(node *ast.Node) bool {
	if !ast.IsJsxAttribute(node) && !ast.IsJsxExpression(node) {
		return false
	}
	tag := owningTag(node)
	return tag != nil && isIntrinsicTag(tag)
}

func inCodeElement(sf *ast.SourceFile, node *ast.Node) bool {
	for p := node.Parent; p != nil; p = p.Parent {
		tag := ""
		if ast.IsJsxElement(p) {
			tag = getText(p.AsJsxElement().OpeningElement.TagName(), sf)
		} else if ast.IsJsxSelfClosingElement(p) {
			tag = getText(p.TagName(), sf)
		}
		if tag == "code" || tag == "pre" {
			return true
		}
	}
	return false
}

// JsxLiteralPropHit is verify/source-checks.ts JsxLiteralPropHit.
type JsxLiteralPropHit struct {
	File string `json:"file"`
	Line int    `json:"line"`
	Via  string `json:"via"`
	Text jsText `json:"text"`
}

// FindJsxLiteralProps ports jsxLiteralProps: copy written in copy props, in
// literals reached through `?:`, `||`, `??` or a template in a JSX child
// expression, and in string arguments to helper calls such as `say('Saved')`.
// With gated, attributes and children of lowercase elements are left to the type gate.
func FindJsxLiteralProps(dir string, allowed, props, helpers []string, gated bool) []JsxLiteralPropHit {
	hits := []JsxLiteralPropHit{}
	for _, file := range SourceFiles(dir, false, true) {
		if !strings.HasSuffix(file, ".tsx") || jsxLiteralSkipFile.MatchString(file) {
			continue
		}
		parsed := ParseSource(file)
		if parsed == nil {
			continue
		}
		sf := parsed.SF
		report := func(node *ast.Node, value, via string) {
			if gated && ownedByGate(node) {
				return
			}
			if !looksLikeCopy(value, allowed) {
				return
			}
			hits = append(hits, JsxLiteralPropHit{
				File: file,
				Line: lineOf(sf, start(node, sf)),
				Via:  via,
				Text: sliceJS(normalizeWhitespace(value), 160),
			})
		}
		walk(sf, func(node *ast.Node) {
			switch {
			case ast.IsJsxAttribute(node) && node.Initializer() != nil:
				name := getText(node.Name(), sf)
				isCopy := !nonCopyProps[name] && !strings.HasPrefix(name, "data-") &&
					(contains(props, name) || copyPropPattern.MatchString(name))
				if !isCopy || inCodeElement(sf, node) {
					return
				}
				init := node.Initializer()
				var exprs []*ast.Node
				if ast.IsStringLiteral(init) {
					exprs = []*ast.Node{init}
				} else if ast.IsJsxExpression(init) && init.Expression() != nil {
					exprs = []*ast.Node{init.Expression()}
				}
				for _, e := range exprs {
					for _, s := range literalStrings(e) {
						report(node, s, name)
					}
				}
			case ast.IsJsxExpression(node) && node.Expression() != nil && isElementOrFragment(node.Parent) && !inCodeElement(sf, node):
				if !isStringLiteralLike(node.Expression()) {
					for _, s := range literalStrings(node.Expression()) {
						report(node, s, "child")
					}
				}
			case ast.IsCallExpression(node):
				callee := node.Expression()
				name := ""
				if ast.IsIdentifier(callee) {
					name = callee.Text()
				} else if ast.IsPropertyAccessExpression(callee) && ast.IsIdentifier(callee.Expression()) {
					name = callee.Expression().Text()
				}
				if name != "" && contains(helpers, name) && !inCodeElement(sf, node) {
					for _, arg := range callArguments(node) {
						for _, s := range literalStrings(arg) {
							report(arg, s, name+"()")
						}
					}
				}
			}
		})
	}
	return hits
}

func rootName(expr *ast.Node) string {
	cur := expr
	for {
		switch {
		case ast.IsPropertyAccessExpression(cur), ast.IsElementAccessExpression(cur), ast.IsCallExpression(cur),
			ast.IsNonNullExpression(cur), ast.IsParenthesizedExpression(cur), ast.IsAsExpression(cur):
			cur = cur.Expression()
			continue
		}
		break
	}
	if ast.IsIdentifier(cur) {
		return cur.Text()
	}
	if cur.Kind == ast.KindImportKeyword {
		return "import"
	}
	return ""
}

func memberName(callee *ast.Node) string {
	if ast.IsPropertyAccessExpression(callee) {
		return callee.Name().Text()
	}
	if ast.IsIdentifier(callee) {
		return callee.Text()
	}
	return ""
}

func propertyKeyName(name *ast.Node, sf *ast.SourceFile) string {
	switch {
	case ast.IsIdentifier(name), ast.IsStringLiteral(name), ast.IsNumericLiteral(name), ast.IsNoSubstitutionTemplateLiteral(name):
		return name.Text()
	case ast.IsComputedPropertyName(name):
		return ""
	}
	return getText(name, sf)
}

func includesNode(list *ast.NodeList, node *ast.Node) bool {
	if list == nil {
		return false
	}
	for _, n := range list.Nodes {
		if n == node {
			return true
		}
	}
	return false
}

func callOrNewArguments(parent *ast.Node) *ast.NodeList {
	if ast.IsNewExpression(parent) {
		return parent.AsNewExpression().Arguments
	}
	return parent.AsCallExpression().Arguments
}

// copyPosition ports copyPosition: whether the literal, in the position node
// gives it (an object property value, an array element, a return or arrow-body
// value, a default, either branch of `?:` / `||` / `??`, a call argument or a
// variable initialiser), is one stringLiteralCopy reads.
func copyPosition(sf *ast.SourceFile, node *ast.Node, copyHelpers []string, inTsx bool) bool {
	child := node
	parent := node.Parent
	for parent != nil {
		if ast.IsParenthesizedExpression(parent) || ast.IsAsExpression(parent) || ast.IsSatisfiesExpression(parent) ||
			ast.IsNonNullExpression(parent) || ast.IsTypeAssertion(parent) {
			child, parent = parent, parent.Parent
			continue
		}
		if ast.IsConditionalExpression(parent) {
			if parent.AsConditionalExpression().Condition == child {
				return false
			}
			child, parent = parent, parent.Parent
			continue
		}
		if ast.IsBinaryExpression(parent) {
			b := parent.AsBinaryExpression()
			through := b.OperatorToken.Kind == ast.KindBarBarToken || b.OperatorToken.Kind == ast.KindQuestionQuestionToken ||
				(b.OperatorToken.Kind == ast.KindAmpersandAmpersandToken && b.Right == child)
			if !through {
				return false
			}
			child, parent = parent, parent.Parent
			continue
		}
		break
	}
	if parent == nil {
		return false
	}
	switch {
	case ast.IsPropertyAssignment(parent) && parent.Initializer() == child:
		key := propertyKeyName(parent.Name(), sf)
		return !(key == "" || copyPropNameSkip.MatchString(key) || strings.HasPrefix(key, "data-") ||
			(strings.HasPrefix(key, "aria-") && !copyAriaCopy.MatchString(key)))
	case ast.IsArrayLiteralExpression(parent):
		return arrayIsCopy(sf, parent)
	case ast.IsReturnStatement(parent):
		return true
	case ast.IsArrowFunction(parent) && parent.Body() == child:
		return true
	case parent.Kind == ast.KindParameter && parent.Initializer() == child:
		return true
	case ast.IsBindingElement(parent) && parent.Initializer() == child:
		return true
	case ast.IsPropertyDeclaration(parent) && parent.Initializer() == child:
		return !copyPropNameSkip.MatchString(getText(parent.Name(), sf))
	case ast.IsVariableDeclaration(parent) && parent.Initializer() == child:
		if !ast.IsIdentifier(parent.Name()) {
			return true
		}
		name := parent.Name().Text()
		return (!copyPropNameSkip.MatchString(name) && !copyConstantName.MatchString(name)) || copyMessageName.MatchString(name)
	case ast.IsCallExpression(parent) || ast.IsNewExpression(parent):
		if !includesNode(callOrNewArguments(parent), child) {
			return false
		}
		callee := parent.Expression()
		if ast.IsNewExpression(parent) && copyNewIgnored.MatchString(memberName(callee)) {
			return false
		}
		root := rootName(callee)
		method := memberName(callee)
		if contains(copyHelpers, root) {
			return !inTsx
		}
		if nonCopyCallRoots[root] || (root == "" && ast.IsCallExpression(callee)) {
			return false
		}
		if nonCopyMethods[method] {
			return false
		}
		if copyErrorSuffix.MatchString(method) || copyThrowPrefix.MatchString(method) {
			return false
		}
		if ast.IsIdentifier(callee) && copyEntryRe.MatchString(callee.Text()) {
			return false
		}
		return true
	}
	return false
}

// arrayIsCopy ports arrayIsCopy: an array of identifiers or keys is a list of
// tokens, not copy.
func arrayIsCopy(sf *ast.SourceFile, array *ast.Node) bool {
	parent := array.Parent
	if ast.IsPropertyAssignment(parent) && copyPropNameSkip.MatchString(propertyKeyName(parent.Name(), sf)) {
		return false
	}
	if ast.IsVariableDeclaration(parent) && ast.IsIdentifier(parent.Name()) && copyPropNameSkip.MatchString(parent.Name().Text()) {
		return false
	}
	if ast.IsCallExpression(parent) && includesNode(parent.AsCallExpression().Arguments, array) {
		if nonCopyMethods[memberName(parent.Expression())] || nonCopyCallRoots[rootName(parent.Expression())] {
			return false
		}
	}
	return true
}

func isSkippedByStringLiteralCopy(node *ast.Node) bool {
	return ast.IsImportDeclaration(node) || ast.IsExportDeclaration(node) || ast.IsImportEqualsDeclaration(node) ||
		ast.IsTypeNode(node) || ast.IsJsxAttribute(node) || node.Kind == ast.KindJsxText ||
		ast.IsTypeAliasDeclaration(node) || ast.IsInterfaceDeclaration(node) || ast.IsDecorator(node)
}

// FindStringLiteralCopy ports stringLiteralCopy: English written outside JSX,
// string and template literals that read as sentences or labels and sit where
// copy lives. Import/export specifiers, JSX attributes, property keys, types,
// styling and identity props, URLs, paths, code, `console.*`, `Error` messages,
// `m.*`, `asI18n*`, `sep`, test helpers and test, story and generated files are
// not reported.
func FindStringLiteralCopy(dir string, copyHelpers []string) []SourceHit {
	hits := []SourceHit{}
	for _, file := range SourceFiles(dir, false, true) {
		if copySkipFile.MatchString(file) {
			continue
		}
		parsed := ParseSource(file)
		if parsed == nil {
			continue
		}
		sf := parsed.SF
		inTsx := strings.HasSuffix(file, ".tsx")
		var visit func(node *ast.Node)
		visit = func(node *ast.Node) {
			if isSkippedByStringLiteralCopy(node) {
				return
			}
			if ast.IsJsxExpression(node) && isElementOrFragment(node.Parent) && node.Expression() != nil &&
				(isStringLiteralLike(node.Expression()) || ast.IsTemplateExpression(node.Expression())) {
				return
			}
			value, isLiteral := "", false
			switch {
			case isStringLiteralLike(node):
				value, isLiteral = node.Text(), true
			case ast.IsTemplateExpression(node):
				value, isLiteral = templateText(node), true
			}
			if isLiteral {
				multiline := !ast.IsStringLiteral(node) && strings.Contains(getText(node, sf), "\n")
				if !multiline && readsAsEnglish(strings.ReplaceAll(value, "{…}", " ")) && copyPosition(sf, node, copyHelpers, inTsx) {
					hits = append(hits, SourceHit{File: file, Line: lineOf(sf, start(node, sf)), Text: sliceJS(normalizeWhitespace(value), 160)})
				}
			}
			forEachChild(node, visit)
		}
		visit(sf.AsNode())
	}
	return hits
}
