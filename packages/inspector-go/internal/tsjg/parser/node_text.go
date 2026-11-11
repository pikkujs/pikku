package parser

// Small helpers shared by the complex node parsers: source-text access that
// mirrors ts.Node#getText/getFullText, and the ts.NodeBuilderFlags values
// used with the checker's TypeToTypeNode (nodebuilder) API.

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/scanner"
)

// Untyped constants matching typescript-go's internal
// nodebuilder.FlagsNoTruncation and nodebuilder.FlagsIgnoreErrors (the
// internal package cannot be imported directly; the checker's exported
// TypeToTypeNode accepts untyped constants for its flags parameter).
const (
	nodeBuilderFlagsNoTruncation = 1 << 0
	nodeBuilderFlagsIgnoreErrors = 1<<15 | 1<<16 | 1<<17 | 1<<18 | 1<<19 | 1<<21 | 1<<26
)

// nodeText mirrors ts.Node#getText(): the source text of the node without
// leading trivia. For synthesized nodes without a source file it falls back
// to the node's text property (mirroring the escapedText/text fallback used
// by TypeLiteralNodeParser.getPropertyName upstream).
func nodeText(node *ast.Node) string {
	if ast.GetSourceFileOfNode(node) == nil {
		return node.Text()
	}
	return scanner.GetTextOfNode(node)
}

// nodeFullText mirrors ts.Node#getFullText(): the source text of the node
// including leading trivia. Synthesized nodes yield an empty string (the
// upstream implementation would throw in that case).
func nodeFullText(node *ast.Node) string {
	source := ast.GetSourceFileOfNode(node)
	if source == nil {
		return ""
	}
	text := source.Text()
	pos, end := node.Pos(), node.End()
	if pos < 0 || end > len(text) || pos > end {
		return ""
	}
	return text[pos:end]
}

// SynthesizedSymbols records identifier→symbol mappings produced by the
// nodebuilder when types are converted back to synthesized type nodes.
// The TypeScript implementation reads `node.symbol` on such nodes; the
// typescript-go nodebuilder instead reports the mapping through the
// idToSymbol map passed to TypeToTypeNode. One registry is shared by all
// parsers of a chain (see factory.CreateParser) so TypeReferenceNodeParser
// can resolve names on synthesized nodes; its lifetime is one generator,
// which keeps runs independent. Not safe for concurrent use, like the rest
// of the parsing pipeline.
type SynthesizedSymbols struct {
	m map[*ast.IdentifierNode]*ast.Symbol
}

func NewSynthesizedSymbols() *SynthesizedSymbols {
	return &SynthesizedSymbols{m: map[*ast.IdentifierNode]*ast.Symbol{}}
}

// Map exposes the underlying map for TypeToTypeNode's idToSymbol parameter.
func (s *SynthesizedSymbols) Map() map[*ast.IdentifierNode]*ast.Symbol { return s.m }

// Lookup resolves a symbol recorded for a synthesized identifier.
func (s *SynthesizedSymbols) Lookup(id *ast.Node) *ast.Symbol { return s.m[id] }
