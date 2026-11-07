package sourcescan

import (
	"regexp"

	"github.com/microsoft/typescript-go/shim/ast"
)

var messagesModuleRe = regexp.MustCompile(`(?:^|/)(?:i18n|paraglide)/messages(?:/index)?(?:\.[cm]?[jt]sx?)?$`)

// MessageSite is a place the message namespace is read without naming a key.
type MessageSite struct {
	File string `json:"file"`
	Line int    `json:"line"`
	Text string `json:"text"`
}

// KeyUsage is one message key and the files that reference it.
type KeyUsage struct {
	Key   string   `json:"key"`
	Files []string `json:"files"`
}

// MessageUsage ports i18n-usage.ts MessageUsage; every collection keeps
// insertion order, as the Set and Map it replaces did.
type MessageUsage struct {
	Keys     []string      `json:"keys"`
	UsedIn   []KeyUsage    `json:"usedIn"`
	Computed []MessageSite `json:"computed"`
	Unparsed []string      `json:"unparsed"`
	Files    int           `json:"files"`
}

// namespaceAliases ports i18n-usage.ts namespaceAliases: the local names under
// which a file imports the message namespace.
//
// The namespace is recognised by the local names under which a file imports it:
// - `import { m } from '<any>/i18n/messages'` or `.../paraglide/messages` (also renamed: `{ m as _m }`),
// - `import * as X from '<any>/i18n/messages'` or `.../paraglide/messages` (Paraglide's own shape),
// - `import { m } from '<any module>'`: `m` imported under the name `m`.
// A file that is itself such a module (`.../i18n/messages.ts`) defines the namespace, so its own
// whole-namespace uses (wrapping, re-typing) are not reported. Re-exports (`export { m } from`) are declarations, not uses. A local `m` (parameter, block-level
// variable, loop or catch variable) shadows the import and is ignored.
func namespaceAliases(sf *ast.SourceFile) map[string]bool {
	aliases := map[string]bool{}
	for _, stmt := range sf.Statements.Nodes {
		if !ast.IsImportDeclaration(stmt) {
			continue
		}
		decl := stmt.AsImportDeclaration()
		if !ast.IsStringLiteral(decl.ModuleSpecifier) {
			continue
		}
		fromMessages := messagesModuleRe.MatchString(decl.ModuleSpecifier.Text())
		if decl.ImportClause == nil {
			continue
		}
		bindings := decl.ImportClause.AsImportClause().NamedBindings
		if bindings == nil {
			continue
		}
		if ast.IsNamespaceImport(bindings) {
			if fromMessages {
				aliases[bindings.Name().Text()] = true
			}
			continue
		}
		for _, el := range bindings.AsNamedImports().Elements.Nodes {
			imported := el.Name()
			propertyName := el.AsImportSpecifier().PropertyName
			if propertyName != nil {
				imported = propertyName
			}
			if imported.Text() == "m" && (fromMessages || propertyName == nil) {
				aliases[el.Name().Text()] = true
			}
		}
	}
	return aliases
}

func isDeclarationName(n *ast.Node) bool {
	p := n.Parent
	switch {
	case p.Kind == ast.KindParameter, ast.IsVariableDeclaration(p), ast.IsBindingElement(p),
		ast.IsPropertyAccessExpression(p), ast.IsPropertyAssignment(p), ast.IsJsxAttribute(p):
		return p.Name() == n
	case ast.IsQualifiedName(p):
		return p.AsQualifiedName().Right == n
	}
	return false
}

func bindsName(name *ast.Node, text string) bool {
	if ast.IsIdentifier(name) {
		return name.Text() == text
	}
	for _, el := range name.AsBindingPattern().Elements.Nodes {
		if !ast.IsOmittedExpression(el) && bindsName(el.Name(), text) {
			return true
		}
	}
	return false
}

func declaresName(list *ast.Node, text string) bool {
	if list == nil || !ast.IsVariableDeclarationList(list) {
		return false
	}
	for _, d := range list.AsVariableDeclarationList().Declarations.Nodes {
		if bindsName(d.Name(), text) {
			return true
		}
	}
	return false
}

func isShadowed(n *ast.Node) bool {
	text := n.Text()
	for p := n.Parent; p != nil; p = p.Parent {
		switch {
		case ast.IsSourceFile(p):
			return false
		case ast.IsFunctionLike(p):
			for _, param := range p.Parameters() {
				if bindsName(param.Name(), text) {
					return true
				}
			}
			if (ast.IsFunctionExpression(p) || ast.IsFunctionDeclaration(p)) &&
				p.Name() != nil && p.Name().Text() == text {
				return true
			}
		case ast.IsBlock(p), ast.IsModuleBlock(p), ast.IsCaseBlock(p):
			var statements []*ast.Node
			switch {
			case ast.IsCaseBlock(p):
				for _, c := range p.AsCaseBlock().Clauses.Nodes {
					statements = append(statements, c.AsCaseOrDefaultClause().Statements.Nodes...)
				}
			case ast.IsBlock(p):
				statements = p.AsBlock().Statements.Nodes
			default:
				statements = p.AsModuleBlock().Statements.Nodes
			}
			for _, st := range statements {
				if ast.IsVariableStatement(st) && declaresName(st.AsVariableStatement().DeclarationList, text) {
					return true
				}
				if (ast.IsFunctionDeclaration(st) || ast.IsClassDeclaration(st)) &&
					st.Name() != nil && st.Name().Text() == text {
					return true
				}
			}
		case ast.IsForStatement(p):
			if declaresName(p.AsForStatement().Initializer, text) {
				return true
			}
		case ast.IsForInStatement(p), ast.IsForOfStatement(p):
			if declaresName(p.AsForInOrOfStatement().Initializer, text) {
				return true
			}
		case ast.IsCatchClause(p):
			if v := p.AsCatchClause().VariableDeclaration; v != nil && bindsName(v.Name(), text) {
				return true
			}
		}
	}
	return false
}

// ScanMessageUsage ports i18n-usage.ts scanMessageUsage.
func ScanMessageUsage(root string) MessageUsage {
	usage := MessageUsage{Keys: []string{}, UsedIn: []KeyUsage{}, Computed: []MessageSite{}, Unparsed: []string{}}
	seenKey := map[string]int{}
	seenFile := map[string]map[string]bool{}
	for _, file := range SourceFiles(root, false, true) {
		parsed := ParseSource(file)
		usage.Files++
		if parsed == nil || !parsed.OK {
			usage.Unparsed = append(usage.Unparsed, file)
		}
		if parsed == nil {
			continue
		}
		sf := parsed.SF
		aliases := namespaceAliases(sf)
		isDefinition := messagesModuleRe.MatchString(file)
		if len(aliases) == 0 {
			continue
		}
		site := func(n *ast.Node, why string) {
			text := jsWhitespaceRun.ReplaceAllString(getText(n.Parent, sf), " ")
			usage.Computed = append(usage.Computed, MessageSite{
				File: file,
				Line: lineOf(sf, start(n, sf)),
				Text: why + ": " + sliceUTF16(text, 100),
			})
		}
		use := func(key string) {
			idx, ok := seenKey[key]
			if !ok {
				idx = len(usage.UsedIn)
				seenKey[key] = idx
				seenFile[key] = map[string]bool{}
				usage.Keys = append(usage.Keys, key)
				usage.UsedIn = append(usage.UsedIn, KeyUsage{Key: key, Files: []string{}})
			}
			if !seenFile[key][file] {
				seenFile[key][file] = true
				usage.UsedIn[idx].Files = append(usage.UsedIn[idx].Files, file)
			}
		}
		var visit func(n *ast.Node)
		visit = func(n *ast.Node) {
			if ast.IsImportDeclaration(n) || ast.IsExportDeclaration(n) {
				return
			}
			if ast.IsIdentifier(n) && aliases[n.Text()] && !isDeclarationName(n) && !isShadowed(n) {
				p := n.Parent
				switch {
				case ast.IsPropertyAccessExpression(p) && p.Expression() == n:
					use(p.Name().Text())
				case ast.IsQualifiedName(p) && p.AsQualifiedName().Left == n:
					use(p.AsQualifiedName().Right.Text())
				case ast.IsElementAccessExpression(p) && p.Expression() == n:
					arg := p.AsElementAccessExpression().ArgumentExpression
					if isStringLiteralLike(arg) {
						use(arg.Text())
					} else {
						site(n, "computed access")
					}
				case ast.IsVariableDeclaration(p) && p.Initializer() == n && ast.IsObjectBindingPattern(p.Name()):
					for _, el := range p.Name().AsBindingPattern().Elements.Nodes {
						b := el.AsBindingElement()
						name := b.PropertyName
						if name == nil {
							name = el.Name()
						}
						if b.DotDotDotToken != nil || (!ast.IsIdentifier(name) && !isStringLiteralLike(name)) {
							site(n, "destructured with rest or computed name")
						} else {
							use(name.Text())
						}
					}
				case !isDefinition:
					site(n, "namespace used as a value")
				}
			}
			forEachChild(n, visit)
		}
		visit(sf.AsNode())
	}
	return usage
}
