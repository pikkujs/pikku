// Package tsutils provides small helpers over the typescript-go AST,
// mirroring src/Utils of the TypeScript implementation.
package tsutils

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/scanner"
)

// SymbolAtNode returns the symbol bound to a node (src/Utils/symbolAtNode.ts).
func SymbolAtNode(node *ast.Node) *ast.Symbol {
	return node.Symbol()
}

// HasJSDocTag reports whether the symbol bound to node has a JSDoc tag with
// the given name on any of its declarations (src/Utils/hasJsDocTag.ts).
func HasJSDocTag(node *ast.Node, tagName string) bool {
	symbol := SymbolAtNode(node)
	if symbol == nil {
		return false
	}
	for _, declaration := range symbol.Declarations {
		sourceFile := ast.GetSourceFileOfNode(declaration)
		for _, doc := range declaration.JSDoc(sourceFile) {
			if jsdocHasTag(sourceFile, doc, tagName) {
				return true
			}
		}
	}
	return false
}

func jsdocHasTag(sourceFile *ast.SourceFile, doc *ast.Node, tagName string) bool {
	jsdoc := doc.AsJSDoc()
	if jsdoc.Tags != nil {
		for _, tag := range jsdoc.Tags.Nodes {
			if name := tag.TagName(); name != nil && name.Text() == tagName {
				return true
			}
		}
	}
	// The old TypeScript parser turned `@@tag` into an empty tag followed
	// by a real `tag`; typescript-go drops the construct entirely and
	// leaves it in the comment text (vega-lite relies on `@@hidden`).
	// Rendering the comment is costly, so check the raw source first.
	rawText := scanner.GetSourceTextOfNodeFromSourceFile(sourceFile, doc, true)
	return strings.Contains(rawText, "@@") &&
		mentionsDoubleAtTag(scanner.GetTextOfJSDocComment(jsdoc.Comment), tagName)
}

// mentionsDoubleAtTag reports whether text contains `@@tagName` as a whole
// tag name, i.e. not followed by another tag name character.
func mentionsDoubleAtTag(text, tagName string) bool {
	needle := "@@" + tagName
	for {
		idx := strings.Index(text, needle)
		if idx < 0 {
			return false
		}
		text = text[idx+len(needle):]
		if text == "" || !isJSDocTagNameChar(text[0]) {
			return true
		}
	}
}

func isJSDocTagNameChar(c byte) bool {
	return c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '_' || c == '-'
}

// IsNodeHidden reports whether the node carries a @hidden JSDoc tag
// (src/Utils/isHidden.ts).
func IsNodeHidden(node *ast.Node) bool {
	return HasJSDocTag(node, "hidden")
}

// HasModifier reports whether the node has the given modifier kind
// (src/Utils/modifiers.ts).
func HasModifier(node *ast.Node, kind ast.Kind) bool {
	modifiers := node.Modifiers()
	if modifiers == nil {
		return false
	}
	for _, m := range modifiers.Nodes {
		if m.Kind == kind {
			return true
		}
	}
	return false
}

// IsPublic reports whether the node is public (no private/protected modifier).
func IsPublic(node *ast.Node) bool {
	return !(HasModifier(node, ast.KindPrivateKeyword) || HasModifier(node, ast.KindProtectedKeyword))
}

// IsStatic reports whether the node has the static modifier.
func IsStatic(node *ast.Node) bool {
	return HasModifier(node, ast.KindStaticKeyword)
}

// GetSymbolAtLocation is a nil-safe wrapper around the checker's
// GetSymbolAtLocation. The TypeScript implementation resolves the node
// through getParseTreeNode first and returns undefined for synthesized
// nodes; typescript-go's exported method dereferences node.Parent without
// that guard, so replicate it here.
func GetSymbolAtLocation(c *checker.Checker, node *ast.Node) *ast.Symbol {
	if node == nil {
		return nil
	}
	if !ast.IsSourceFile(node) && (node.Parent == nil || ast.GetSourceFileOfNode(node) == nil) {
		return nil
	}
	return c.GetSymbolAtLocation(node)
}
