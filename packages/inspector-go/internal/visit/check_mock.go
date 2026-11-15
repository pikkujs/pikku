package visit

import (
	"fmt"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
)

// readFunctionMock reads a function's `mock`: `true` declares it without a
// body. A mocked function that also has a body, or a `mock` the build cannot
// read, is refused rather than guessed at.
func (s *Context) readFunctionMock(obj *ast.Node, name string) bool {
	for _, p := range obj.Properties() {
		if !ast.IsPropertyAssignment(p) || !ast.IsIdentifier(p.Name()) || p.Name().Text() != "mock" {
			continue
		}
		switch p.Initializer().Kind {
		case ast.KindTrueKeyword:
		case ast.KindFalseKeyword:
			return false
		default:
			s.Log.Critical(diag.InvalidValue, fmt.Sprintf(
				"'%s' has a `mock` the build cannot read. Use `mock: true`, or remove it.", name))
			return false
		}
		for _, k := range implementationKeys {
			if s.getPropertyAssignmentInitializer(obj, k, true) != nil {
				s.Log.Critical(diag.InvalidValue, fmt.Sprintf(
					"'%s' declares `mock: true` and also has a `%s`. A function is either mocked or implemented: remove `mock`, or remove the body.", name, k))
				return false
			}
		}
		return true
	}
	return false
}
