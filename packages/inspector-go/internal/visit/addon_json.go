package visit

import (
	"bytes"
	"encoding/json"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/jsjson"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// ojson is a parsed JSON value that keeps object key order, so metadata read
// from an addon's generated files can be edited (JSON.parse, mutate,
// JSON.stringify in the TS) and written back in the order JS would write it.
type ojson struct {
	obj *state.Record[*ojson]
	arr []*ojson
	// scalar is a string, float64, bool or nil (JSON null).
	scalar any
	isArr  bool
}

func parseOJSON(b []byte) (*ojson, error) {
	v := &ojson{}
	if err := json.Unmarshal(b, v); err != nil {
		return nil, err
	}
	return v, nil
}

func (v *ojson) UnmarshalJSON(b []byte) error {
	t := bytes.TrimLeft(b, " \t\r\n")
	switch {
	case len(t) > 0 && t[0] == '{':
		v.obj = state.NewRecord[*ojson]()
		return v.obj.UnmarshalJSON(t)
	case len(t) > 0 && t[0] == '[':
		v.isArr = true
		return json.Unmarshal(t, &v.arr)
	default:
		return json.Unmarshal(t, &v.scalar)
	}
}

func (v *ojson) MarshalJSON() ([]byte, error) {
	switch {
	case v == nil:
		return []byte("null"), nil
	case v.obj != nil:
		return v.obj.MarshalJSON()
	case v.isArr:
		if v.arr == nil {
			return []byte("[]"), nil
		}
		return jsjson.Marshal(v.arr, "")
	default:
		return jsjson.Marshal(v.scalar, "")
	}
}

func (v *ojson) isObject() bool { return v != nil && v.obj != nil }

// get is `v[k]` for an object, nil otherwise or when absent.
func (v *ojson) get(k string) *ojson {
	if !v.isObject() {
		return nil
	}
	return v.obj.At(k)
}

func (v *ojson) has(k string) bool { return v.isObject() && v.obj.Has(k) }

func (v *ojson) set(k string, val *ojson) {
	if v.isObject() {
		v.obj.Set(k, val)
	}
}

// str is the value when it is a string.
func (v *ojson) str() (string, bool) {
	if v == nil {
		return "", false
	}
	s, ok := v.scalar.(string)
	return s, ok
}

// truthy is JS truthiness.
func (v *ojson) truthy() bool {
	switch {
	case v == nil:
		return false
	case v.obj != nil, v.isArr:
		return true
	}
	switch x := v.scalar.(type) {
	case string:
		return x != ""
	case float64:
		return x != 0
	case bool:
		return x
	}
	return false
}

// values is Object.values for an object or an array.
func (v *ojson) values() []*ojson {
	if v != nil && v.isArr {
		return v.arr
	}
	if !v.isObject() {
		return nil
	}
	var out []*ojson
	v.obj.Each(func(_ string, x *ojson) { out = append(out, x) })
	return out
}

func ojsonString(s string) *ojson { return &ojson{scalar: s} }

func newOObject() *ojson { return &ojson{obj: state.NewRecord[*ojson]()} }

// isJSObject is `v && typeof v === 'object'`.
func (v *ojson) isJSObject() bool { return v != nil && (v.obj != nil || v.isArr) }

// strings is the string members of an array.
func (v *ojson) strings() []string {
	if v == nil || !v.isArr {
		return nil
	}
	out := []string{}
	for _, x := range v.arr {
		if s, ok := x.str(); ok {
			out = append(out, s)
		}
	}
	return out
}

func (v *ojson) raw() state.Raw { return state.Raw(jsjson.MustMarshal(v)) }

// clone is a deep copy, for `{ ...x }` where the copy is then edited.
func (v *ojson) clone() *ojson {
	if v == nil {
		return nil
	}
	out := &ojson{scalar: v.scalar, isArr: v.isArr}
	if v.obj != nil {
		out.obj = state.NewRecord[*ojson]()
		v.obj.Each(func(k string, x *ojson) { out.obj.Set(k, x.clone()) })
	}
	for _, x := range v.arr {
		out.arr = append(out.arr, x.clone())
	}
	return out
}
