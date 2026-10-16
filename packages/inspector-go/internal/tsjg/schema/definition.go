// Package schema models JSON Schema draft-07 definitions as produced by the
// type formatters, mirroring src/Schema of the TypeScript implementation.
package schema

import (
	"bytes"
	"encoding/json"
	"fmt"
	"iter"
	"maps"
	"math"
	"slices"
	"sort"
)

// Definition is a JSON Schema definition. Fields cover the subset of
// draft-07 that the generator emits; anything else (JSDoc annotations such
// as description, default, examples, ...) lives in Extra.
//
// Definition is marshal-only: MarshalJSON below controls emission order and
// omission entirely (struct tags would be ignored and are omitted).
//
// Several fields are typed `any` because JSON Schema allows alternatives:
//   - Type: string or []string
//   - Items: *Definition or []*Definition
//   - AdditionalProperties / AdditionalItems: bool or *Definition
//   - Const / Default / Enum members: any JSON value
type Definition struct {
	ID                   string
	Schema               string
	Ref                  string
	Comment              string
	Title                string
	Type                 any
	Format               string
	Enum                 []any
	Const                *any
	Not                  *Definition
	AllOf                []*Definition
	AnyOf                []*Definition
	OneOf                []*Definition
	If                   *Definition
	Then                 *Definition
	Else                 *Definition
	Items                any
	MinItems             *int
	MaxItems             *int
	AdditionalItems      any
	Properties           *Properties
	Required             []string
	AdditionalProperties any
	PatternProperties    map[string]*Definition
	PropertyNames        *Definition
	Discriminator        any
	Definitions          map[string]*Definition
	// Extra holds annotation keywords merged into the definition
	// (description, default, examples, custom tags, ...).
	Extra map[string]any
}

// SetExtra sets an annotation keyword on the definition.
func (d *Definition) SetExtra(key string, value any) {
	if d.Extra == nil {
		d.Extra = map[string]any{}
	}
	d.Extra[key] = value
}

// HasType reports whether the definition's type is or includes name.
func (d *Definition) HasType(name string) bool {
	switch t := d.Type.(type) {
	case string:
		return t == name
	case []string:
		if slices.Contains(t, name) {
			return true
		}
	case []any:
		for _, s := range t {
			if s == name {
				return true
			}
		}
	}
	return false
}

// IsEmpty reports whether the definition has no keys set
// (`Object.keys(def).length === 0` in the TypeScript source).
func (d *Definition) IsEmpty() bool {
	return d.ID == "" && d.Schema == "" && d.Ref == "" && d.Comment == "" && d.Title == "" &&
		d.Type == nil && d.Format == "" && d.Enum == nil && d.Const == nil && d.Not == nil &&
		d.AllOf == nil && d.AnyOf == nil && d.OneOf == nil && d.If == nil && d.Then == nil &&
		d.Else == nil && d.Items == nil && d.MinItems == nil && d.MaxItems == nil &&
		d.AdditionalItems == nil && d.Properties.Len() == 0 && len(d.Required) == 0 &&
		d.AdditionalProperties == nil && d.PatternProperties == nil && d.PropertyNames == nil &&
		d.Discriminator == nil && d.Definitions == nil && len(d.Extra) == 0
}

// Properties is an insertion-ordered map of property name to definition.
type Properties struct {
	keys   []string
	values map[string]*Definition
}

func NewProperties() *Properties {
	return &Properties{values: map[string]*Definition{}}
}

func (p *Properties) Set(key string, value *Definition) {
	if _, exists := p.values[key]; !exists {
		p.keys = append(p.keys, key)
	}
	p.values[key] = value
}

func (p *Properties) Get(key string) (*Definition, bool) {
	v, ok := p.values[key]
	return v, ok
}

func (p *Properties) Keys() []string { return p.keys }

// All iterates over the properties in insertion order. A nil Properties
// yields nothing.
func (p *Properties) All() iter.Seq2[string, *Definition] {
	return func(yield func(string, *Definition) bool) {
		if p == nil {
			return
		}
		for _, k := range p.keys {
			if !yield(k, p.values[k]) {
				return
			}
		}
	}
}

// Clone returns a copy of the properties that shares the definitions.
func (p *Properties) Clone() *Properties {
	c := &Properties{
		keys:   append([]string(nil), p.keys...),
		values: make(map[string]*Definition, len(p.values)),
	}
	maps.Copy(c.values, p.values)
	return c
}

func (p *Properties) Len() int {
	if p == nil {
		return 0
	}
	return len(p.keys)
}

func (p *Properties) MarshalJSON() ([]byte, error) {
	var buf bytes.Buffer
	buf.WriteByte('{')
	for _, k := range p.keys {
		if err := writeMember(&buf, k, p.values[k]); err != nil {
			return nil, err
		}
	}
	buf.WriteByte('}')
	return buf.Bytes(), nil
}

// writeMember appends "key":value to the JSON object open in buf, preceded
// by a comma unless it is the first member. It encodes without HTML
// escaping: json.Marshal would escape <, > and & inside nested MarshalJSON
// output, which the caller's Encoder.SetEscapeHTML(false) cannot undo.
func writeMember(buf *bytes.Buffer, key string, value any) error {
	if buf.Len() > len("{") {
		buf.WriteByte(',')
	}
	if err := encodeUnescaped(buf, key); err != nil {
		return err
	}
	buf.WriteByte(':')
	return encodeUnescaped(buf, value)
}

func encodeUnescaped(buf *bytes.Buffer, value any) error {
	var encoded bytes.Buffer
	encoder := json.NewEncoder(&encoded)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		return err
	}
	buf.Write(bytes.TrimSuffix(encoded.Bytes(), []byte("\n")))
	return nil
}

// MarshalJSON emits fields in a stable, reader-friendly order and merges
// Extra keys into the object.
func (d *Definition) MarshalJSON() ([]byte, error) {
	var buf bytes.Buffer
	buf.WriteByte('{')
	emitted := map[string]bool{}
	emit := func(key string, v any) error {
		emitted[key] = true
		return writeMember(&buf, key, jsonSafe(v))
	}

	type field struct {
		key string
		val any
		on  bool
	}
	fields := []field{
		{"$id", d.ID, d.ID != ""},
		{"$schema", d.Schema, d.Schema != ""},
		{"$ref", d.Ref, d.Ref != ""},
		{"$comment", d.Comment, d.Comment != ""},
		{"title", d.Title, d.Title != ""},
		{"type", d.Type, d.Type != nil},
		{"format", d.Format, d.Format != ""},
		{"enum", d.Enum, d.Enum != nil},
		{"const", constVal(d.Const), d.Const != nil},
		{"not", d.Not, d.Not != nil},
		{"allOf", d.AllOf, d.AllOf != nil},
		{"anyOf", d.AnyOf, d.AnyOf != nil},
		{"oneOf", d.OneOf, d.OneOf != nil},
		{"if", d.If, d.If != nil},
		{"then", d.Then, d.Then != nil},
		{"else", d.Else, d.Else != nil},
		{"items", d.Items, d.Items != nil},
		{"minItems", d.MinItems, d.MinItems != nil},
		{"maxItems", d.MaxItems, d.MaxItems != nil},
		{"additionalItems", d.AdditionalItems, d.AdditionalItems != nil},
		{"properties", d.Properties, d.Properties != nil},
		{"required", d.Required, len(d.Required) > 0},
		{"additionalProperties", d.AdditionalProperties, d.AdditionalProperties != nil},
		{"patternProperties", sortedMap(d.PatternProperties), d.PatternProperties != nil},
		{"propertyNames", d.PropertyNames, d.PropertyNames != nil},
		{"discriminator", d.Discriminator, d.Discriminator != nil},
	}
	for _, f := range fields {
		if f.on {
			if err := emit(f.key, f.val); err != nil {
				return nil, err
			}
		}
	}

	extraKeys := make([]string, 0, len(d.Extra))
	for k := range d.Extra {
		// An annotation must not shadow a keyword the struct already
		// emitted, or the object would carry a duplicate key.
		if emitted[k] || (k == "definitions" && d.Definitions != nil) {
			continue
		}
		extraKeys = append(extraKeys, k)
	}
	sort.Strings(extraKeys)
	for _, k := range extraKeys {
		if err := emit(k, d.Extra[k]); err != nil {
			return nil, err
		}
	}

	if d.Definitions != nil {
		if err := emit("definitions", sortedMap(d.Definitions)); err != nil {
			return nil, err
		}
	}

	buf.WriteByte('}')
	return buf.Bytes(), nil
}

// jsonSafe rewrites the values that JSON.stringify accepts but encoding/json
// rejects or renders differently: non-finite numbers become null and negative
// zero becomes zero. It recurses through the generic containers that reach
// MarshalJSON via Const, Enum and Extra.
func jsonSafe(v any) any {
	switch x := v.(type) {
	case float64:
		if math.IsInf(x, 0) || math.IsNaN(x) {
			return nil
		}
		if x == 0 {
			return 0.0
		}
		return x
	case []any:
		out := make([]any, len(x))
		for i, e := range x {
			out[i] = jsonSafe(e)
		}
		return out
	case map[string]any:
		out := make(map[string]any, len(x))
		for k, e := range x {
			out[k] = jsonSafe(e)
		}
		return out
	default:
		return v
	}
}

func constVal(p *any) any {
	if p == nil {
		return nil
	}
	return *p
}

// sortedMap wraps a map for marshaling with sorted keys.
type sortedMapT struct{ m map[string]*Definition }

func sortedMap(m map[string]*Definition) sortedMapT { return sortedMapT{m} }

func (s sortedMapT) MarshalJSON() ([]byte, error) {
	keys := make([]string, 0, len(s.m))
	for k := range s.m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var buf bytes.Buffer
	buf.WriteByte('{')
	for _, k := range keys {
		if err := writeMember(&buf, k, s.m[k]); err != nil {
			return nil, err
		}
	}
	buf.WriteByte('}')
	return buf.Bytes(), nil
}

// Clone returns a deep-ish copy of the definition: nested containers are
// copied, but leaf *Definition values are shared.
func (d *Definition) Clone() *Definition {
	c := *d
	if d.Properties != nil {
		c.Properties = d.Properties.Clone()
	}
	if d.Extra != nil {
		c.Extra = make(map[string]any, len(d.Extra))
		maps.Copy(c.Extra, d.Extra)
	}
	c.Required = append([]string(nil), d.Required...)
	c.Enum = append([]any(nil), d.Enum...)
	c.AllOf = append([]*Definition(nil), d.AllOf...)
	c.AnyOf = append([]*Definition(nil), d.AnyOf...)
	c.OneOf = append([]*Definition(nil), d.OneOf...)
	return &c
}

func (d *Definition) String() string {
	b, err := json.Marshal(d)
	if err != nil {
		return fmt.Sprintf("<definition: %v>", err)
	}
	return string(b)
}
