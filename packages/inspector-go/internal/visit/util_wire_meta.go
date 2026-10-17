package visit

import (
	"fmt"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// wireMetaData is getCommonWireMetaData with its logger: the metadata plus
// the diagnostics TS reports for a non-literal name and for tags / errors
// that are not arrays. wiringName is "" for TS's null.
func (s *Context) wireMetaData(obj *ast.Node, wiringType, wiringName string) commonMeta {
	s.assertStringLiteralProperty(obj, "name", wiringType)
	shown := "null"
	if wiringName != "" {
		shown = wiringName
	}
	for _, p := range obj.Properties() {
		if !ast.IsPropertyAssignment(p) || !ast.IsIdentifier(p.Name()) || ast.IsArrayLiteralExpression(p.Initializer()) {
			continue
		}
		switch p.Name().Text() {
		case "tags":
			s.Log.Critical(diag.InvalidTagsType, fmt.Sprintf("%s '%s' has invalid 'tags' property - must be an array of strings.", wiringType, shown))
		case "errors":
			s.Log.Critical(diag.InvalidTagsType, fmt.Sprintf("%s '%s' has invalid 'errors' property - must be an array of error identifiers.", wiringType, shown))
		}
	}
	return s.getCommonWireMetaData(obj)
}

// setCommon writes summary, description, errors and tags the way the wiring
// meta literals spread them (undefined members dropped).
func (o *jsObject) setCommon(cm commonMeta) {
	o.set("summary", nilIfNil(cm.summary))
	o.set("description", nilIfNil(cm.description))
	if cm.hasErrors {
		o.set("errors", cm.errors)
	}
	if cm.hasTags {
		o.set("tags", cm.tags)
	}
}

// propValue is getPropertyValue's result as a JSON value (nil for null).
func propValue(v tsutil.PropValue) any {
	switch {
	case !v.Present:
		return nil
	case v.Str != nil:
		return *v.Str
	case v.Num != nil:
		return *v.Num
	case v.Bool != nil:
		return *v.Bool
	case v.Strs != nil:
		return v.Strs
	}
	return nil
}

// wiringFuncId is extractFunctionName plus the context-based id TS gives an
// inline function.
// isHelper is extractFunctionName's.
func (s *Context) wiringFuncId(funcInit *ast.Node, wiringType, name string) (id string, isHelper bool) {
	extracted := s.extractFunctionName(funcInit)
	id = extracted.pikkuFuncId
	if isTempId(id) && name != "" {
		id = makeContextBasedId(wiringType, name)
	}
	return id, extracted.isHelper
}

// tagsOrNil is the tags resolveMiddleware takes: undefined when absent.
func (cm commonMeta) tagsOrNil() []string {
	if cm.hasTags {
		return cm.tags
	}
	return nil
}

// middlewareValue is the middleware member: undefined when there is none.
func middlewareValue(m []WireRef) any {
	if len(m) == 0 {
		return nil
	}
	return m
}
