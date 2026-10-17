package formatter

import (
	"fmt"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/schema"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// AnnotatedTypeFormatter mirrors src/TypeFormatter/AnnotatedTypeFormatter.ts.
type AnnotatedTypeFormatter struct {
	childTypeFormatter TypeFormatter
}

func NewAnnotatedTypeFormatter(childTypeFormatter TypeFormatter) *AnnotatedTypeFormatter {
	return &AnnotatedTypeFormatter{childTypeFormatter: childTypeFormatter}
}

func (f *AnnotatedTypeFormatter) SupportsType(t types.Type) bool {
	return isType[*types.AnnotatedType](t)
}

func (f *AnnotatedTypeFormatter) GetDefinition(t types.Type) *schema.Definition {
	annotatedType := t.(*types.AnnotatedType)
	annotations := annotatedType.Annotations

	if discriminator, ok := annotations["discriminator"]; ok {
		deref := types.DerefType(annotatedType.Type)
		if unionType, isUnion := deref.(*types.UnionType); isUnion {
			unionType.Discriminator, _ = discriminator.(string)
			delete(annotations, "discriminator")
		} else {
			panic(fmt.Errorf(
				"cannot assign discriminator tag to type: %s. This tag can only be assigned to union types",
				deref.Name(),
			))
		}
	}

	// def = {...childDefinition, ...annotations}: clone the child definition,
	// then let annotation keys override.
	def := f.childTypeFormatter.GetDefinition(annotatedType.Type).Clone()
	for key, value := range annotatedType.Annotations {
		applyAnnotation(def, key, value)
	}

	if def.Ref != "" && def.Type != nil {
		def.Ref = ""
	}

	if annotatedType.Nullable {
		return makeNullable(def)
	}

	return def
}

func (f *AnnotatedTypeFormatter) GetChildren(t types.Type) []types.Type {
	return f.childTypeFormatter.GetChildren(t.(*types.AnnotatedType).Type)
}

// stringFields maps string-valued JSON Schema keywords to their typed field.
var stringFields = map[string]func(*schema.Definition) *string{
	"$id":      func(d *schema.Definition) *string { return &d.ID },
	"$schema":  func(d *schema.Definition) *string { return &d.Schema },
	"$ref":     func(d *schema.Definition) *string { return &d.Ref },
	"$comment": func(d *schema.Definition) *string { return &d.Comment },
	"title":    func(d *schema.Definition) *string { return &d.Title },
	"format":   func(d *schema.Definition) *string { return &d.Format },
}

// applyAnnotation merges one annotation keyword into the definition. In the
// TypeScript implementation this is a plain object spread; here known JSON
// Schema keywords land on the corresponding struct fields (clearing them and
// falling back to Extra when the raw annotation value cannot be represented
// in the typed field), and everything else goes into Extra.
func applyAnnotation(def *schema.Definition, key string, value any) {
	if field, ok := stringFields[key]; ok {
		s, isString := value.(string)
		*field(def) = s
		if !isString {
			def.SetExtra(key, value)
		}
		return
	}

	switch key {
	case "type":
		def.Type = value
	case "enum":
		if list, ok := value.([]any); ok {
			def.Enum = list
		} else {
			def.Enum = nil
			def.SetExtra(key, value)
		}
	case "const":
		def.Const = new(value)
	case "items":
		def.Items = value
	case "additionalItems":
		def.AdditionalItems = value
	case "additionalProperties":
		def.AdditionalProperties = value
	case "minItems":
		def.MinItems = intOrRaw(def, key, value)
	case "maxItems":
		def.MaxItems = intOrRaw(def, key, value)
	case "required":
		if list, ok := toStringSlice(value); ok {
			def.Required = list
		} else {
			def.Required = nil
			def.SetExtra(key, value)
		}
	case "not", "allOf", "anyOf", "oneOf", "if", "then", "else",
		"properties", "patternProperties", "propertyNames", "discriminator":
		clearField(def, key)
		def.SetExtra(key, value)
	default:
		def.SetExtra(key, value)
	}
}

// intOrRaw returns value as an int for a typed field, or stores the raw
// value in Extra and returns nil when it is not a number.
func intOrRaw(def *schema.Definition, key string, value any) *int {
	if n, ok := toInt(value); ok {
		return new(n)
	}
	def.SetExtra(key, value)
	return nil
}

// clearField resets the typed field of a structural keyword so that a raw
// annotation stored in Extra is not emitted twice.
func clearField(def *schema.Definition, key string) {
	switch key {
	case "not":
		def.Not = nil
	case "allOf":
		def.AllOf = nil
	case "anyOf":
		def.AnyOf = nil
	case "oneOf":
		def.OneOf = nil
	case "if":
		def.If = nil
	case "then":
		def.Then = nil
	case "else":
		def.Else = nil
	case "properties":
		def.Properties = nil
	case "patternProperties":
		def.PatternProperties = nil
	case "propertyNames":
		def.PropertyNames = nil
	case "discriminator":
		def.Discriminator = nil
	}
}

func toInt(value any) (int, bool) {
	n, ok := value.(float64)
	return int(n), ok
}

func toStringSlice(value any) ([]string, bool) {
	list, ok := value.([]any)
	if !ok {
		return nil, false
	}
	out := make([]string, len(list))
	for i, v := range list {
		s, ok := v.(string)
		if !ok {
			return nil, false
		}
		out[i] = s
	}
	return out, true
}
