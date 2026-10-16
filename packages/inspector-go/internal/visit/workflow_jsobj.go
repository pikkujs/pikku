package visit

import (
	"bytes"
	"strconv"
	"strings"
	"unicode/utf16"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/jsjson"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// The workflow extractors build plain JS objects whose key order is the order
// of the TS object literals, including keys whose value is `undefined` (they
// keep their position when assigned later, and JSON.stringify skips them).
// jsObj models exactly that; the workflow meta is serialized from it.

// jsUndefinedT is the `undefined` value: a key holding it is skipped when the
// object is encoded, as JSON.stringify does.
type jsUndefinedT struct{}

var jsUndefined = jsUndefinedT{}

type jsObj struct{ rec state.Record[any] }

// newObj builds an object from key/value pairs, in order.
func newObj(kv ...any) *jsObj {
	o := &jsObj{}
	for i := 0; i+1 < len(kv); i += 2 {
		o.Set(kv[i].(string), kv[i+1])
	}
	return o
}

// Set assigns k; an existing key keeps its position.
func (o *jsObj) Set(k string, v any) { o.rec.Set(k, v) }

// Get returns the value of k, or jsUndefined.
func (o *jsObj) Get(k string) any {
	if o == nil {
		return jsUndefined
	}
	v, ok := o.rec.Get(k)
	if !ok {
		return jsUndefined
	}
	return v
}

// Str returns k's value when it is a string.
func (o *jsObj) Str(k string) (string, bool) {
	s, ok := o.Get(k).(string)
	return s, ok
}

// Steps returns k's value when it is a step list.
func (o *jsObj) Steps(k string) []*jsObj {
	s, _ := o.Get(k).([]*jsObj)
	return s
}

// DefinedLen is Object.keys(o).length for the keys whose value is defined.
func (o *jsObj) DefinedLen() int {
	n := 0
	for _, k := range o.rec.Keys() {
		if !isUndefined(o.rec.At(k)) {
			n++
		}
	}
	return n
}

func isUndefined(v any) bool {
	_, ok := v.(jsUndefinedT)
	return ok
}

func (o *jsObj) MarshalJSON() ([]byte, error) {
	var buf bytes.Buffer
	buf.WriteByte('{')
	first := true
	for _, k := range o.rec.Keys() {
		v := o.rec.At(k)
		if isUndefined(v) {
			continue
		}
		if !first {
			buf.WriteByte(',')
		}
		first = false
		kb, _ := jsjson.Marshal(k, "")
		buf.Write(kb)
		buf.WriteByte(':')
		vb, err := marshalJS(v)
		if err != nil {
			return nil, err
		}
		buf.Write(vb)
	}
	buf.WriteByte('}')
	return buf.Bytes(), nil
}

// marshalJS encodes v; undefined inside an array becomes null, as in
// JSON.stringify.
func marshalJS(v any) ([]byte, error) {
	switch t := v.(type) {
	case jsUndefinedT:
		return []byte("null"), nil
	case []any:
		var buf bytes.Buffer
		buf.WriteByte('[')
		for i, e := range t {
			if i > 0 {
				buf.WriteByte(',')
			}
			b, err := marshalJS(e)
			if err != nil {
				return nil, err
			}
			buf.Write(b)
		}
		buf.WriteByte(']')
		return buf.Bytes(), nil
	}
	return jsjson.Marshal(v, "")
}

// raw encodes the object for a Record[Raw] state section.
func (o *jsObj) raw() state.Raw { return state.Raw(jsjson.MustMarshal(o)) }

// orUndef maps Go's (value, ok) to value | undefined.
func orUndef[T any](v T, ok bool) any {
	if !ok {
		return jsUndefined
	}
	return v
}

// strOrUndef is `s || undefined` for an optional string pointer.
func strPtrOrUndef(s *string) any {
	if s == nil {
		return jsUndefined
	}
	return *s
}

// jsNumber is Number(numericLiteral.text).
func jsNumber(text string) float64 {
	t := strings.ReplaceAll(text, "_", "")
	if f, err := strconv.ParseFloat(t, 64); err == nil {
		return f
	}
	if len(t) > 2 && t[0] == '0' {
		base := 0
		switch t[1] {
		case 'x', 'X':
			base = 16
		case 'o', 'O':
			base = 8
		case 'b', 'B':
			base = 2
		}
		if base != 0 {
			if n, err := strconv.ParseUint(t[2:], base, 64); err == nil {
				return float64(n)
			}
		}
	}
	return 0
}

// utf16Prefix is JS `s.slice(0, n)`.
func utf16Prefix(s string, n int) string {
	u := utf16.Encode([]rune(s))
	if len(u) <= n {
		return s
	}
	return string(utf16.Decode(u[:n]))
}
