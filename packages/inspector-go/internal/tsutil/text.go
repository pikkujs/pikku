package tsutil

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/scanner"
)

var NonAlnum = regexp.MustCompile(`[^a-zA-Z0-9]`)

func FuncIdToTypeName(id string) string {
	var b strings.Builder
	for _, s := range NonAlnum.Split(id, -1) {
		if s == "" {
			continue
		}
		b.WriteString(strings.ToUpper(s[:1]) + s[1:])
	}
	return b.String()
}

func FormatVersionedId(base string, version int) string {
	return fmt.Sprintf("%s@v%d", base, version)
}

func NodeStart(n *ast.Node) int {
	return scanner.GetTokenPosOfNode(n, ast.GetSourceFileOfNode(n), false)
}

// NodeText is ts.Node#getText(): the source text from the token start.
func NodeText(n *ast.Node) string {
	sf := ast.GetSourceFileOfNode(n)
	return sf.Text()[NodeStart(n):n.End()]
}

func IsFunctionLike(n *ast.Node) bool {
	return n != nil && (ast.IsArrowFunction(n) || ast.IsFunctionExpression(n))
}

func IsPikkuCall(n *ast.Node) bool {
	return n != nil && ast.IsCallExpression(n) && ast.IsIdentifier(n.Expression()) &&
		strings.HasPrefix(n.Expression().Text(), "pikku")
}

func HasExportModifier(n *ast.Node) bool {
	return n.ModifierFlags()&ast.ModifierFlagsExport != 0
}

func FirstDecl(sym *ast.Symbol) *ast.Node {
	if sym == nil || len(sym.Declarations) == 0 {
		return nil
	}
	return sym.Declarations[0]
}

// UTF16Offset converts a UTF-8 byte offset into text to the UTF-16 code-unit
// offset Strada would report for the same position.
func UTF16Offset(text string, byteOff int) int {
	n := 0
	for _, r := range text[:byteOff] {
		if r >= 0x10000 {
			n += 2
		} else {
			n++
		}
	}
	return n
}
