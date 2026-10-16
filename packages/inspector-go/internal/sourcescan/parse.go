// Package sourcescan ports the single-file, parse-only helpers of
// @pikku/inspector and the CLI: readModuleSpecifiers, readJsxLiteralText and
// the stub scan of `pikku mocks`. None of them builds a program; each parses
// one file the way ts.createSourceFile does.
package sourcescan

import (
	"regexp"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/core"
	"github.com/microsoft/typescript-go/shim/parser"
	"github.com/microsoft/typescript-go/shim/scanner"
	"github.com/microsoft/typescript-go/shim/tspath"
)

// Parse is ts.createSourceFile(fileName, content, Latest, true, scriptKind).
// ScriptKindUnknown takes the kind from the extension, falling back to TS as
// ensureScriptKind does.
func Parse(fileName, content string, kind core.ScriptKind) *ast.SourceFile {
	if kind == core.ScriptKindUnknown {
		kind = core.GetScriptKindFromFileName(fileName)
		if kind == core.ScriptKindUnknown {
			kind = core.ScriptKindTS
		}
	}
	// typescript-go requires an absolute, normalized name; the name only
	// labels the parse here, so a relative one is rooted at "/".
	name := tspath.GetNormalizedAbsolutePath(fileName, "/")
	return parser.ParseSourceFile(ast.SourceFileParseOptions{
		FileName: name,
		Path:     tspath.Path(name),
	}, content, kind)
}

// start is node.getStart(source).
func start(n *ast.Node, sf *ast.SourceFile) int {
	return scanner.GetTokenPosOfNode(n, sf, false)
}

// lineOf is source.getLineAndCharacterOfPosition(pos).line + 1.
func lineOf(sf *ast.SourceFile, pos int) int {
	return scanner.GetECMALineOfPosition(sf, pos) + 1
}

// getText is node.getText(source).
func getText(n *ast.Node, sf *ast.SourceFile) string {
	return sf.Text()[start(n, sf):n.End()]
}

// forEachChild is ts.forEachChild(node, visit) for a visit that never stops.
func forEachChild(n *ast.Node, visit func(*ast.Node)) {
	n.ForEachChild(func(child *ast.Node) bool {
		visit(child)
		return false
	})
}

// jsWhitespace is the set JavaScript's \s and String#trim match: WhiteSpace
// and LineTerminator. Go's \s is ASCII only.
const jsWhitespace = `\t\n\v\f\r \x{a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}`

var jsWhitespaceRun = regexp.MustCompile(`[` + jsWhitespace + `]+`)

// jsTrim is String.prototype.trim.
func jsTrim(s string) string {
	return strings.TrimFunc(s, isJSWhitespace)
}

func isJSWhitespace(r rune) bool {
	switch r {
	case '\t', '\n', '\v', '\f', '\r', ' ', 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff:
		return true
	}
	return r >= 0x2000 && r <= 0x200a
}
