package visit

import (
	"fmt"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// validateAuthSessionless ports utils/validate-auth-sessionless.ts.
func (s *Context) validateAuthSessionless(obj *ast.Node, funcName, wireDescription string, inheritedAuth *bool) bool {
	fnMeta := s.resolveFunctionMeta(funcName)
	if fnMeta == nil {
		return true
	}
	resolvedAuth := tsutil.GetPropertyValue(obj, "auth").Bool
	if resolvedAuth == nil {
		resolvedAuth = inheritedAuth
	}
	if resolvedAuth != nil && !*resolvedAuth && fnMeta.Sessionless != nil && !*fnMeta.Sessionless {
		s.Log.Critical(diag.AuthDisabledRequiresSessionless, fmt.Sprintf(
			"%s has auth disabled but function '%s' uses pikkuFunc (requires session). Use pikkuSessionlessFunc instead.", wireDescription, funcName))
		return false
	}
	return true
}
