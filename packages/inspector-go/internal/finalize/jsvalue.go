// This file holds the JS-value model the finalize steps work on where the
// state section is still Raw JSON: an ordered object that enumerates keys as
// a JS object does, can hold `undefined` members (they keep their position
// and are dropped on encoding, as JSON.stringify drops them), and is shared
// by pointer so in-place mutation behaves like JS object references.

package finalize

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"strconv"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/jsjson"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// undefinedT is JS `undefined`.
type undefinedT struct{}

// Undefined is the JS `undefined` value: an object member holding it keeps
// its key position but is left out of the encoding; in an array it encodes as
// null.
var Undefined = undefinedT{}

// Values are nil (null), bool, float64, string, []any, *Object or Undefined.

// Object is a JS plain object.
type Object struct {
	keys []string
	vals map[string]any
}

func NewObject() *Object { return &Object{vals: map[string]any{}} }

// Set assigns o[k] = v: a new key goes last, an existing one keeps its place.
func (o *Object) Set(k string, v any) *Object {
	if o.vals == nil {
		o.vals = map[string]any{}
	}
	if _, ok := o.vals[k]; !ok {
		o.keys = append(o.keys, k)
	}
	o.vals[k] = v
	return o
}

// Get returns o[k], Undefined when the key is absent.
func (o *Object) Get(k string) any {
	if o == nil {
		return Undefined
	}
	v, ok := o.vals[k]
	if !ok {
		return Undefined
	}
	return v
}

// Has is `k in o`.
func (o *Object) Has(k string) bool {
	if o == nil {
		return false
	}
	_, ok := o.vals[k]
	return ok
}

func (o *Object) Delete(k string) {
	if o == nil || !o.Has(k) {
		return
	}
	delete(o.vals, k)
	for i, x := range o.keys {
		if x == k {
			o.keys = append(o.keys[:i:i], o.keys[i+1:]...)
			break
		}
	}
}

// Keys is Object.keys(o): array-index keys first, ascending, then the rest
// in insertion order. Members holding undefined are included, as in JS.
func (o *Object) Keys() []string {
	if o == nil {
		return nil
	}
	return jsKeyOrder(o.keys)
}

func (o *Object) Len() int {
	if o == nil {
		return 0
	}
	return len(o.keys)
}

// Clone is a shallow copy.
func (o *Object) Clone() *Object {
	c := NewObject()
	for _, k := range o.keys {
		c.Set(k, o.vals[k])
	}
	return c
}

func (o *Object) MarshalJSON() ([]byte, error) {
	var buf bytes.Buffer
	if err := encodeValue(&buf, o, nil); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// Obj builds an object from alternating key/value pairs.
func Obj(kv ...any) *Object {
	o := NewObject()
	for i := 0; i+1 < len(kv); i += 2 {
		o.Set(kv[i].(string), kv[i+1])
	}
	return o
}

// ---- decoding ----

// Parse decodes JSON into a JS value, keeping object key order (a repeated
// key keeps its first position and its last value, as JSON.parse does).
func Parse(b []byte) (any, error) {
	dec := json.NewDecoder(bytes.NewReader(b))
	dec.UseNumber()
	v, err := parseValue(dec)
	if err != nil {
		return nil, err
	}
	return v, nil
}

// ParseRaw decodes a state.Raw; an empty Raw is null.
func ParseRaw(r state.Raw) (any, error) {
	if len(r) == 0 {
		return nil, nil
	}
	return Parse(r)
}

func parseValue(dec *json.Decoder) (any, error) {
	t, err := dec.Token()
	if err != nil {
		return nil, err
	}
	switch t := t.(type) {
	case json.Delim:
		switch t {
		case '{':
			o := NewObject()
			for dec.More() {
				kt, err := dec.Token()
				if err != nil {
					return nil, err
				}
				v, err := parseValue(dec)
				if err != nil {
					return nil, err
				}
				o.Set(kt.(string), v)
			}
			_, err := dec.Token()
			return o, err
		case '[':
			arr := []any{}
			for dec.More() {
				v, err := parseValue(dec)
				if err != nil {
					return nil, err
				}
				arr = append(arr, v)
			}
			_, err := dec.Token()
			return arr, err
		}
		return nil, fmt.Errorf("unexpected %v", t)
	case json.Number:
		return strconv.ParseFloat(string(t), 64)
	default:
		return t, nil // nil, bool, string
	}
}

// ---- encoding ----

// Marshal is JSON.stringify(v).
func Marshal(v any) ([]byte, error) {
	var buf bytes.Buffer
	if err := encodeValue(&buf, v, nil); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// ToRaw is JSON.stringify(v) as a state.Raw.
func ToRaw(v any) state.Raw {
	b, err := Marshal(v)
	if err != nil {
		panic(err)
	}
	return state.Raw(b)
}

func encodeValue(buf *bytes.Buffer, v any, stack []*Object) error {
	switch v := v.(type) {
	case nil, undefinedT:
		buf.WriteString("null")
	case bool:
		if v {
			buf.WriteString("true")
		} else {
			buf.WriteString("false")
		}
	case float64:
		buf.WriteString(NumberJSON(v))
	case int:
		buf.WriteString(strconv.Itoa(v))
	case string:
		b, _ := jsjson.Marshal(v, "")
		buf.Write(b)
	case []any:
		buf.WriteByte('[')
		for i, x := range v {
			if i > 0 {
				buf.WriteByte(',')
			}
			if err := encodeValue(buf, x, stack); err != nil {
				return err
			}
		}
		buf.WriteByte(']')
	case []string:
		buf.WriteByte('[')
		for i, x := range v {
			if i > 0 {
				buf.WriteByte(',')
			}
			b, _ := jsjson.Marshal(x, "")
			buf.Write(b)
		}
		buf.WriteByte(']')
	case *Object:
		if v == nil {
			buf.WriteString("null")
			return nil
		}
		for _, s := range stack {
			if s == v {
				return fmt.Errorf("Converting circular structure to JSON")
			}
		}
		stack = append(stack, v)
		buf.WriteByte('{')
		first := true
		for _, k := range v.Keys() {
			x := v.vals[k]
			if _, ok := x.(undefinedT); ok {
				continue
			}
			if !first {
				buf.WriteByte(',')
			}
			first = false
			kb, _ := jsjson.Marshal(k, "")
			buf.Write(kb)
			buf.WriteByte(':')
			if err := encodeValue(buf, x, stack); err != nil {
				return err
			}
		}
		buf.WriteByte('}')
	case state.Raw:
		if len(v) == 0 {
			buf.WriteString("null")
		} else {
			buf.Write(v)
		}
	default:
		b, err := jsjson.Marshal(v, "")
		if err != nil {
			return err
		}
		buf.Write(b)
	}
	return nil
}

// NumberJSON formats a number as JSON.stringify does (null for NaN/±Inf).
func NumberJSON(f float64) string {
	if math.IsNaN(f) || math.IsInf(f, 0) {
		return "null"
	}
	b, _ := jsjson.Marshal(f, "")
	return string(b)
}

// NumberString is String(n).
func NumberString(f float64) string {
	switch {
	case math.IsNaN(f):
		return "NaN"
	case math.IsInf(f, 1):
		return "Infinity"
	case math.IsInf(f, -1):
		return "-Infinity"
	}
	return NumberJSON(f)
}

// ---- JS semantics helpers ----

// Truthy is JS truthiness.
func Truthy(v any) bool {
	switch v := v.(type) {
	case nil, undefinedT:
		return false
	case bool:
		return v
	case float64:
		return v != 0 && !math.IsNaN(v)
	case int:
		return v != 0
	case string:
		return v != ""
	}
	return true
}

// IsUndefined reports v === undefined.
func IsUndefined(v any) bool {
	_, ok := v.(undefinedT)
	return ok
}

// Nullish is v == null.
func Nullish(v any) bool { return v == nil || IsUndefined(v) }

// AsObject returns v as an object, or nil.
func AsObject(v any) *Object {
	o, _ := v.(*Object)
	return o
}

// AsArray returns v as an array, or nil.
func AsArray(v any) []any {
	a, _ := v.([]any)
	return a
}

// AsString returns v when it is a string.
func AsString(v any) (string, bool) {
	s, ok := v.(string)
	return s, ok
}

// TemplateString is `${v}` for the primitive values a template interpolates.
func TemplateString(v any) string {
	switch v := v.(type) {
	case nil:
		return "null"
	case undefinedT:
		return "undefined"
	case bool:
		return strconv.FormatBool(v)
	case float64:
		return NumberString(v)
	case int:
		return strconv.Itoa(v)
	case string:
		return v
	case *Object:
		return "[object Object]"
	case []any:
		s := ""
		for i, x := range v {
			if i > 0 {
				s += ","
			}
			if !Nullish(x) {
				s += TemplateString(x)
			}
		}
		return s
	}
	return fmt.Sprint(v)
}

// Clone deep-copies a value, as JSON.parse(JSON.stringify(v)) would (minus
// dropping undefined members).
func DeepClone(v any) any {
	switch v := v.(type) {
	case *Object:
		c := NewObject()
		for _, k := range v.keys {
			c.Set(k, DeepClone(v.vals[k]))
		}
		return c
	case []any:
		c := make([]any, len(v))
		for i, x := range v {
			c[i] = DeepClone(x)
		}
		return c
	}
	return v
}

// isArrayIndex mirrors state's array-index rule.
func isArrayIndex(k string) (uint64, bool) {
	if k == "" || len(k) > 10 || (len(k) > 1 && k[0] == '0') {
		return 0, false
	}
	n, err := strconv.ParseUint(k, 10, 64)
	if err != nil || n >= 1<<32-1 {
		return 0, false
	}
	return n, true
}

func jsKeyOrder(keys []string) []string {
	var idx []uint64
	var idxKeys []string
	for _, k := range keys {
		if n, ok := isArrayIndex(k); ok {
			idx = append(idx, n)
			idxKeys = append(idxKeys, k)
		}
	}
	if len(idx) == 0 {
		return append([]string(nil), keys...)
	}
	// insertion sort, small n
	for i := 1; i < len(idx); i++ {
		for j := i; j > 0 && idx[j] < idx[j-1]; j-- {
			idx[j], idx[j-1] = idx[j-1], idx[j]
			idxKeys[j], idxKeys[j-1] = idxKeys[j-1], idxKeys[j]
		}
	}
	out := idxKeys
	for _, k := range keys {
		if _, ok := isArrayIndex(k); !ok {
			out = append(out, k)
		}
	}
	return out
}
