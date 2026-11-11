package parser

import (
	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// BasicAnnotationsReader reads schema keywords from JSDoc tags
// (src/AnnotationsReader/BasicAnnotationsReader.ts).
type BasicAnnotationsReader struct {
	extraTags map[string]bool
}

// requiresDollar tags are emitted with a "$" prefix ($id, $comment, $ref).
var requiresDollar = map[string]bool{
	"id":      true,
	"comment": true,
	"ref":     true,
}

// textTags carry their raw text value.
var textTags = map[string]bool{
	"title":       true,
	"description": true,
	"id":          true,

	"format":  true,
	"pattern": true,
	"ref":     true,

	// New since draft-07:
	"comment":          true,
	"contentMediaType": true,
	"contentEncoding":  true,

	// Custom tag for if-then-else support.
	"discriminator": true,
}

// jsonTags carry a JSON5-encoded value.
var jsonTags = map[string]bool{
	"minimum":          true,
	"exclusiveMinimum": true,

	"maximum":          true,
	"exclusiveMaximum": true,

	"multipleOf": true,

	"minLength": true,
	"maxLength": true,

	"minProperties": true,
	"maxProperties": true,

	"minItems":    true,
	"maxItems":    true,
	"uniqueItems": true,

	"propertyNames": true,
	"contains":      true,
	"const":         true,
	"examples":      true,

	"default": true,

	"required": true,

	// New since draft-07:
	"if":        true,
	"then":      true,
	"else":      true,
	"readOnly":  true,
	"writeOnly": true,

	// New since draft 2019-09:
	"deprecated": true,
}

// NewBasicAnnotationsReader creates a reader; extraTags is a set of
// additional tag names parsed like jsonTags.
func NewBasicAnnotationsReader(extraTags map[string]bool) *BasicAnnotationsReader {
	return &BasicAnnotationsReader{extraTags: extraTags}
}

func (r *BasicAnnotationsReader) GetAnnotations(node *ast.Node) types.Annotations {
	return r.annotationsFromTags(symbolJSDocTags(node))
}

// annotationsFromTags converts the tags returned by symbolJSDocTags into
// annotations, so that ExtendedAnnotationsReader can share one tag lookup.
func (r *BasicAnnotationsReader) annotationsFromTags(jsDocTags []jsDocTagInfo) types.Annotations {
	if len(jsDocTags) == 0 {
		return nil
	}

	annotations := types.Annotations{}
	for _, jsDocTag := range jsDocTags {
		value, ok := r.parseJSDocTag(jsDocTag)
		if !ok {
			continue
		}
		if requiresDollar[jsDocTag.name] {
			annotations["$"+jsDocTag.name] = value
		} else {
			annotations[jsDocTag.name] = value
		}
	}

	if len(annotations) == 0 {
		return nil
	}
	return annotations
}

func (r *BasicAnnotationsReader) parseJSDocTag(jsDocTag jsDocTagInfo) (any, bool) {
	isTextTag := textTags[jsDocTag.name]
	text := jsDocTag.text
	if text == "" && !isTextTag {
		// Non-text tags without explicit value (e.g. `@deprecated`) default to `true`.
		text = "true"
	}

	if isTextTag {
		return text, true
	}
	if !jsonTags[jsDocTag.name] && !r.extraTags[jsDocTag.name] {
		// Unknown jsDoc tag.
		return nil, false
	}
	if parsed, err := parseJSON5(text); err == nil {
		return parsed, true
	}
	return text, true
}
