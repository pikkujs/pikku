package tsutil

import (
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/printer"
)

// PrintNode is ts.createPrinter({removeComments: true}).printNode.
//
// typescript-go ranks a non-null assertion at unary precedence, so it prints
// `x!.y` as `(x!).y`; Strada treats `x!` as a left-hand-side expression and
// never parenthesises it. The hash must stay byte-compatible with the TS
// inspector, so those synthesised parens are recorded as they are written and
// cut from the output.
func PrintNode(n *ast.Node) string {
	w := &parenTrackingWriter{EmitTextWriter: printer.NewTextWriter("\n", 0), lastOpen: -1}
	var stack []int
	handlers := printer.PrintHandlers{
		OnBeforeEmitNode: func(node *ast.Node) {
			if node == nil || node.Kind != ast.KindNonNullExpression {
				return
			}
			open := -1
			if w.lastOpen == w.GetTextPos()-1 && isLeftHandOperand(node) {
				open = w.lastOpen
			}
			stack = append(stack, open)
		},
		OnAfterEmitNode: func(node *ast.Node) {
			if node == nil || node.Kind != ast.KindNonNullExpression || len(stack) == 0 {
				return
			}
			open := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			if open >= 0 {
				w.cut = append(w.cut, open)
				w.closeNext = true
			}
		},
	}
	p := printer.NewPrinter(printer.PrinterOptions{RemoveComments: true}, handlers, nil)
	p.Write(n, ast.GetSourceFileOfNode(n), w, nil)
	out := w.String()
	if len(w.cut) == 0 {
		return out
	}
	sort.Ints(w.cut)
	var b strings.Builder
	prev := 0
	for _, i := range w.cut {
		b.WriteString(out[prev:i])
		prev = i + 1
	}
	b.WriteString(out[prev:])
	return b.String()
}

// isLeftHandOperand: `x!` is what is accessed, called, constructed or
// incremented, the places typescript-go adds parens. A `(` written just before it anywhere else
// is the source's own: an argument list, `if (`, a ParenthesizedExpression.
func isLeftHandOperand(node *ast.Node) bool {
	parent := node.Parent
	if parent == nil {
		return false
	}
	switch parent.Kind {
	case ast.KindPropertyAccessExpression, ast.KindElementAccessExpression,
		ast.KindCallExpression, ast.KindNewExpression, ast.KindTaggedTemplateExpression:
		return parent.Expression() == node
	case ast.KindPostfixUnaryExpression:
		return parent.AsPostfixUnaryExpression().Operand == node
	}
	return false
}

type parenTrackingWriter struct {
	printer.EmitTextWriter
	lastOpen  int
	closeNext bool
	cut       []int
}

func (w *parenTrackingWriter) WritePunctuation(s string) {
	w.EmitTextWriter.WritePunctuation(s)
	switch {
	case s == "(":
		w.lastOpen = w.GetTextPos() - 1
	case s == ")" && w.closeNext:
		w.closeNext = false
		w.cut = append(w.cut, w.GetTextPos()-1)
	}
}
