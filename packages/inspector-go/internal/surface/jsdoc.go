package surface

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/scanner"
)

// The functions here mirror Strada's language-service JSDoc readers
// (getDocumentationComment, getJsDocTags, displayPartsToString), which the
// TypeScript collectSurface reads through. Display parts are flattened to
// their text as they are produced, since every caller joins them anyway.

type tagInfo struct {
	name string
	text string
}

// jsDocNodes is node.jsDoc: every JSDoc comment attached to the node.
func jsDocNodes(node *ast.Node) []*ast.Node {
	return node.JSDoc(nil)
}

func singleVariableOfVariableStatement(node *ast.Node) *ast.Node {
	if node == nil || node.Kind != ast.KindVariableStatement {
		return nil
	}
	list := node.AsVariableStatement().DeclarationList
	if list == nil {
		return nil
	}
	decls := list.AsVariableDeclarationList().Declarations
	if decls == nil || len(decls.Nodes) == 0 {
		return nil
	}
	return decls.Nodes[0]
}

func singleInitializerOfVariableStatementOrPropertyDeclaration(node *ast.Node) *ast.Node {
	switch node.Kind {
	case ast.KindVariableStatement:
		if v := singleVariableOfVariableStatement(node); v != nil {
			return v.Initializer()
		}
	case ast.KindPropertyDeclaration, ast.KindPropertyAssignment:
		return node.Initializer()
	}
	return nil
}

func nestedModuleDeclaration(node *ast.Node) bool {
	if node.Kind != ast.KindModuleDeclaration {
		return false
	}
	body := node.AsModuleDeclaration().Body
	return body != nil && body.Kind == ast.KindModuleDeclaration
}

// nextJSDocCommentLocation is Strada's getNextJSDocCommentLocation, which
// differs from typescript-go's own in which parents it climbs to.
func nextJSDocCommentLocation(node *ast.Node) *ast.Node {
	parent := node.Parent
	if parent == nil {
		return nil
	}
	switch {
	case parent.Kind == ast.KindPropertyAssignment,
		parent.Kind == ast.KindExportAssignment,
		parent.Kind == ast.KindPropertyDeclaration,
		parent.Kind == ast.KindExpressionStatement && node.Kind == ast.KindPropertyAccessExpression,
		parent.Kind == ast.KindReturnStatement,
		nestedModuleDeclaration(parent),
		ast.IsAssignmentExpression(node, false):
		return parent
	}
	if gp := parent.Parent; gp != nil && (singleVariableOfVariableStatement(gp) == node || ast.IsAssignmentExpression(parent, false)) {
		return gp
	}
	if gp := parent.Parent; gp != nil && gp.Parent != nil {
		ggp := gp.Parent
		if singleVariableOfVariableStatement(ggp) != nil || singleInitializerOfVariableStatementOrPropertyDeclaration(ggp) == node {
			return ggp
		}
	}
	return nil
}

func isOverloadTag(tag *ast.Node) bool { return tag.Kind == ast.KindJSDocOverloadTag }

func tagNodes(jsdoc *ast.Node) []*ast.Node {
	if jsdoc.Kind != ast.KindJSDoc {
		return nil
	}
	if tags := jsdoc.AsJSDoc().Tags; tags != nil {
		return tags.Nodes
	}
	return nil
}

// filterOwnedJSDocTags keeps the last comment whole and only the @overload
// tags of the ones before it.
func filterOwnedJSDocTags(comments []*ast.Node) []*ast.Node {
	var out []*ast.Node
	for i, jsdoc := range comments {
		if i == len(comments)-1 {
			out = append(out, jsdoc)
			continue
		}
		for _, tag := range tagNodes(jsdoc) {
			if isOverloadTag(tag) {
				out = append(out, tag)
			}
		}
	}
	return out
}

// jsDocCommentsAndTags is getJSDocCommentsAndTags: JSDoc nodes and loose
// tags, gathered from the host and the nodes its comment may sit on.
func jsDocCommentsAndTags(host *ast.Node) []*ast.Node {
	var result []*ast.Node
	if init := variableLikeInitializer(host); init != nil {
		if docs := jsDocNodes(init); len(docs) > 0 {
			result = append(result, filterOwnedJSDocTags(docs)...)
		}
	}
	for node := host; node != nil && node.Parent != nil; node = nextJSDocCommentLocation(node) {
		if docs := jsDocNodes(node); len(docs) > 0 {
			result = append(result, filterOwnedJSDocTags(docs)...)
		}
		if node.Kind == ast.KindParameter {
			result = append(result, parameterTags(node)...)
			break
		}
		if node.Kind == ast.KindTypeParameter {
			result = append(result, typeParameterTags(node)...)
			break
		}
	}
	return result
}

func variableLikeInitializer(node *ast.Node) *ast.Node {
	switch node.Kind {
	case ast.KindVariableDeclaration, ast.KindParameter, ast.KindPropertyDeclaration,
		ast.KindPropertyAssignment, ast.KindBindingElement, ast.KindEnumMember:
		return node.Initializer()
	}
	return nil
}

// jsDocTags is getJSDocTags(node).
func jsDocTags(node *ast.Node) []*ast.Node {
	var tags []*ast.Node
	for _, each := range jsDocCommentsAndTags(node) {
		if each.Kind == ast.KindJSDoc {
			tags = append(tags, tagNodes(each)...)
		} else {
			tags = append(tags, each)
		}
	}
	return tags
}

func parameterTags(param *ast.Node) []*ast.Node {
	name := param.Name()
	if name == nil || param.Parent == nil {
		return nil
	}
	var paramTags []*ast.Node
	for _, tag := range jsDocTags(param.Parent) {
		if tag.Kind == ast.KindJSDocParameterTag {
			paramTags = append(paramTags, tag)
		}
	}
	if name.Kind == ast.KindIdentifier {
		var out []*ast.Node
		for _, tag := range paramTags {
			if n := tag.Name(); n != nil && n.Kind == ast.KindIdentifier && n.Text() == name.Text() {
				out = append(out, tag)
			}
		}
		return out
	}
	params := param.Parent.Parameters()
	for i, p := range params {
		if p == param && i < len(paramTags) {
			return []*ast.Node{paramTags[i]}
		}
	}
	return nil
}

func typeParameterTags(param *ast.Node) []*ast.Node {
	name := param.Name()
	if name == nil || param.Parent == nil {
		return nil
	}
	var out []*ast.Node
	for _, tag := range jsDocTags(param.Parent) {
		if tag.Kind != ast.KindJSDocTemplateTag {
			continue
		}
		tps := tag.AsJSDocTemplateTag().TypeParameters
		if tps == nil {
			continue
		}
		for _, tp := range tps.Nodes {
			if tp.Name() != nil && tp.Name().Text() == name.Text() {
				out = append(out, tag)
				break
			}
		}
	}
	return out
}

func commentList(node *ast.Node) *ast.NodeList {
	if node.Kind == ast.KindJSDoc {
		return node.AsJSDoc().Comment
	}
	return node.CommentList()
}

func hasComment(node *ast.Node) bool {
	list := commentList(node)
	return list != nil
}

// displayText is displayPartsToString(getDisplayPartsFromComment(comment)).
func displayText(list *ast.NodeList, c *checker.Checker) string {
	if list == nil {
		return ""
	}
	var b strings.Builder
	for _, n := range list.Nodes {
		switch n.Kind {
		case ast.KindJSDocText:
			b.WriteString(n.Text())
		case ast.KindJSDocLink, ast.KindJSDocLinkCode, ast.KindJSDocLinkPlain:
			b.WriteString(linkDisplayText(n, c))
		}
	}
	return b.String()
}

func linkPrefix(n *ast.Node) string {
	switch n.Kind {
	case ast.KindJSDocLink:
		return "link"
	case ast.KindJSDocLinkCode:
		return "linkcode"
	}
	return "linkplain"
}

// linkDisplayText is buildLinkParts.
func linkDisplayText(link *ast.Node, c *checker.Checker) string {
	var b strings.Builder
	b.WriteString("{@" + linkPrefix(link) + " ")
	name := link.Name()
	text := link.Text()
	if name == nil {
		b.WriteString(text)
	} else {
		var target *ast.Symbol
		if c != nil {
			if sym := c.GetSymbolAtLocation(name); sym != nil {
				target = symbolTarget(sym, c)
			}
		}
		suffix := findLinkNameEnd(text)
		full := scanner.GetTextOfNode(name) + text[:suffix]
		rest := skipSeparatorFromLinkText(text[suffix:])
		var decl *ast.Node
		if target != nil {
			decl = target.ValueDeclaration
			if decl == nil && len(target.Declarations) > 0 {
				decl = target.Declarations[0]
			}
		}
		if decl != nil {
			b.WriteString(full)
			b.WriteString(rest)
		} else {
			sep := ""
			if suffix == 0 || (suffix < len(text) && text[suffix] == '|' && !strings.HasSuffix(full, " ")) {
				sep = " "
			}
			b.WriteString(full + sep + rest)
		}
	}
	b.WriteString("}")
	return b.String()
}

func symbolTarget(sym *ast.Symbol, c *checker.Checker) *ast.Symbol {
	next := sym
	for i := 0; i < 100 && next != nil && next.Flags&ast.SymbolFlagsAlias != 0; i++ {
		next = c.GetAliasedSymbol(next)
	}
	return next
}

func findLinkNameEnd(text string) int {
	pos := strings.Index(text, "://")
	if pos == 0 {
		for pos < len(text) && text[pos] != '|' {
			pos++
		}
		return pos
	}
	if strings.HasPrefix(text, "()") {
		return 2
	}
	if strings.HasPrefix(text, "<") {
		brackets := 0
		for i := 0; i < len(text); {
			if text[i] == '<' {
				brackets++
			}
			if text[i] == '>' {
				brackets--
			}
			i++
			if brackets == 0 {
				return i
			}
		}
	}
	return 0
}

func skipSeparatorFromLinkText(text string) string {
	if strings.HasPrefix(text, "|") {
		pos := 1
		for pos < len(text) && text[pos] == ' ' {
			pos++
		}
		return text[pos:]
	}
	return text
}

// textOfJSDocComment is getTextOfJSDocComment, whose links keep their source
// form rather than their display form.
func textOfJSDocComment(list *ast.NodeList) (string, bool) {
	if list == nil {
		return "", false
	}
	var b strings.Builder
	for _, n := range list.Nodes {
		if n.Kind == ast.KindJSDocText {
			b.WriteString(n.Text())
			continue
		}
		name := ""
		if nm := n.Name(); nm != nil {
			name = scanner.GetTextOfNode(nm)
		}
		text := n.Text()
		space := " "
		if n.Name() != nil && (text == "" || strings.HasPrefix(text, "://")) {
			space = ""
		}
		b.WriteString("{@" + linkPrefix(n) + " " + name + space + text + "}")
	}
	return b.String(), true
}

func isTypedefOrCallback(t *ast.Node) bool {
	return t.Kind == ast.KindJSDocTypedefTag || t.Kind == ast.KindJSDocCallbackTag
}

func isParamOrReturn(t *ast.Node) bool {
	return t.Kind == ast.KindJSDocParameterTag || t.Kind == ast.KindJSDocReturnTag
}

func anyNode(nodes []*ast.Node, f func(*ast.Node) bool) bool {
	for _, n := range nodes {
		if f(n) {
			return true
		}
	}
	return false
}

func commentHavingNodes(decl *ast.Node) []*ast.Node {
	switch decl.Kind {
	case ast.KindJSDocParameterTag, ast.KindJSDocPropertyTag:
		return []*ast.Node{decl}
	case ast.KindJSDocCallbackTag, ast.KindJSDocTypedefTag:
		return []*ast.Node{decl, decl.Parent}
	case ast.KindJSDocSignature:
		if decl.Parent != nil && decl.Parent.Kind == ast.KindJSDocOverloadTag {
			return []*ast.Node{decl.Parent.Parent}
		}
	}
	return jsDocCommentsAndTags(decl)
}

func uniqueDecls(decls []*ast.Node) []*ast.Node {
	seen := map[*ast.Node]bool{}
	var out []*ast.Node
	for _, d := range decls {
		if d == nil || seen[d] {
			continue
		}
		seen[d] = true
		out = append(out, d)
	}
	return out
}

// docCommentsFromDeclarations is getJsDocCommentsFromDeclarations. The bool
// reports whether any part was produced, which getDocumentationComment's
// inheritance check needs (an empty comment still counts as a part).
func docCommentsFromDeclarations(decls []*ast.Node, c *checker.Checker) (string, bool) {
	var parts []string
	for _, decl := range uniqueDecls(decls) {
		for _, jsdoc := range commentHavingNodes(decl) {
			var inheritDoc *ast.Node
			isDoc := jsdoc.Kind == ast.KindJSDoc
			if isDoc {
				for _, t := range tagNodes(jsdoc) {
					if t.Kind == ast.KindJSDocUnknownTag {
						if n := t.TagName().Text(); n == "inheritDoc" || n == "inheritdoc" {
							inheritDoc = t
							break
						}
					}
				}
			}
			tags := tagNodes(jsdoc)
			if (!hasComment(jsdoc) && inheritDoc == nil) ||
				(isDoc && decl.Kind != ast.KindJSDocTypedefTag && decl.Kind != ast.KindJSDocCallbackTag &&
					anyNode(tags, isTypedefOrCallback) && !anyNode(tags, isParamOrReturn)) {
				continue
			}
			text := ""
			if hasComment(jsdoc) {
				text = displayText(commentList(jsdoc), c)
			}
			if inheritDoc != nil && inheritDoc.CommentList() != nil {
				text += displayText(inheritDoc.CommentList(), c)
			}
			dup := false
			for _, p := range parts {
				if p == text {
					dup = true
					break
				}
			}
			if !dup {
				parts = append(parts, text)
			}
		}
	}
	return strings.Join(parts, "\n"), len(parts) > 0
}

// documentationComment is Symbol.getDocumentationComment(checker) as text.
func documentationComment(sym *ast.Symbol, c *checker.Checker, seen map[*ast.Symbol]bool) string {
	if sym == nil {
		return ""
	}
	decls := sym.Declarations
	if len(decls) == 0 {
		return ""
	}
	doc, any := docCommentsFromDeclarations(decls, c)
	inherit := !any || anyNode(decls, hasInheritDocTag)
	if c != nil && inherit {
		if seen == nil {
			seen = map[*ast.Symbol]bool{}
		}
		for _, decl := range decls {
			if decl.Kind == ast.KindGetAccessor || decl.Kind == ast.KindSetAccessor {
				continue
			}
			base := findBaseOfDeclaration(c, decl, func(s *ast.Symbol) (string, bool) {
				if seen[s] {
					return "", false
				}
				seen[s] = true
				return documentationComment(s, c, seen), true
			})
			if base != nil {
				if !any {
					doc = *base
					any = true
				} else {
					doc = *base + "\n" + doc
				}
			}
		}
	}
	return doc
}

func hasInheritDocTag(node *ast.Node) bool {
	for _, t := range jsDocTags(node) {
		if t.TagName() != nil {
			if n := t.TagName().Text(); n == "inheritDoc" || n == "inheritdoc" {
				return true
			}
		}
	}
	return false
}

func superTypeNodes(node *ast.Node) []*ast.Node {
	if node.Kind == ast.KindInterfaceDeclaration {
		return ast.GetExtendsHeritageClauseElements(node)
	}
	if ast.IsClassLike(node) {
		var out []*ast.Node
		if base := ast.GetClassExtendsHeritageElement(node); base != nil {
			out = append(out, base)
		}
		return append(out, ast.GetImplementsTypeNodes(node)...)
	}
	return nil
}

// findBaseOfDeclaration returns the first defined result of cb over the same
// member of the declaration's base types. A nil return means undefined; cb's
// false is undefined too.
func findBaseOfDeclaration(c *checker.Checker, decl *ast.Node, cb func(*ast.Symbol) (string, bool)) *string {
	parent := decl.Parent
	if parent == nil {
		return nil
	}
	if parent.Kind == ast.KindConstructor {
		parent = parent.Parent
	}
	if parent == nil || decl.Symbol() == nil {
		return nil
	}
	static := ast.HasStaticModifier(decl)
	for _, superType := range superTypeNodes(parent) {
		baseType := c.GetTypeAtLocation(superType)
		if baseType == nil {
			continue
		}
		t := baseType
		if static && baseType.Symbol() != nil {
			t = c.GetTypeOfSymbol(baseType.Symbol())
		}
		prop := c.GetPropertyOfType(t, decl.Symbol().Name)
		if prop == nil {
			continue
		}
		if s, ok := cb(prop); ok {
			return &s
		}
	}
	return nil
}

// jsDocTagsOfSymbol is Symbol.getJsDocTags(checker), with each tag's display
// text. Only the default display form is reproduced, which is what the
// @deprecated and @example tags the surface reads use.
func jsDocTagsOfSymbol(sym *ast.Symbol, c *checker.Checker) []tagInfo {
	if sym == nil {
		return nil
	}
	var infos []tagInfo
	for _, decl := range uniqueDecls(sym.Declarations) {
		tags := jsDocTags(decl)
		if anyNode(tags, isTypedefOrCallback) && !anyNode(tags, isParamOrReturn) {
			continue
		}
		for _, tag := range tags {
			infos = append(infos, tagInfo{name: tag.TagName().Text(), text: displayText(tag.CommentList(), c)})
			infos = append(infos, propertyTagInfos(tag, c)...)
		}
	}
	return infos
}

func propertyTagInfos(tag *ast.Node, c *checker.Checker) []tagInfo {
	if tag.Kind != ast.KindJSDocParameterTag && tag.Kind != ast.KindJSDocPropertyTag {
		return nil
	}
	pt := tag.AsJSDocParameterOrPropertyTag()
	if !pt.IsNameFirst || pt.TypeExpression == nil {
		return nil
	}
	lit := pt.TypeExpression.Type()
	if lit == nil || lit.Kind != ast.KindJSDocTypeLiteral {
		return nil
	}
	var out []tagInfo
	if props := lit.AsJSDocTypeLiteral().JSDocPropertyTags; len(props) > 0 {
		for _, p := range props {
			out = append(out, tagInfo{name: p.TagName().Text(), text: displayText(p.CommentList(), c)})
			out = append(out, propertyTagInfos(p, c)...)
		}
	}
	return out
}
