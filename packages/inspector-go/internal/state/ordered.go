package state

import (
	"bytes"
	"encoding/json"
	"slices"
	"sort"
	"strconv"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/jsjson"
)

// Record is a JS plain object (`Record<string, V>`): it serializes as a JSON
// object whose keys follow JavaScript's own-property order — array-index keys
// ("0", "17") first in ascending numeric order, then every other key in
// insertion order. Re-setting a key keeps its position; deleting and
// re-adding moves it to the end, as in JS.
//
// The zero value is an empty record ready to use.
type Record[V any] struct {
	keys []string
	vals map[string]V
}

// NewRecord returns an empty record.
func NewRecord[V any]() *Record[V] { return &Record[V]{} }

func (r *Record[V]) Set(k string, v V) {
	if r.vals == nil {
		r.vals = map[string]V{}
	}
	if _, ok := r.vals[k]; !ok {
		r.keys = append(r.keys, k)
	}
	r.vals[k] = v
}

func (r *Record[V]) Get(k string) (V, bool) {
	v, ok := r.vals[k]
	return v, ok
}

// At returns the value for k, or the zero value.
func (r *Record[V]) At(k string) V { return r.vals[k] }

func (r *Record[V]) Has(k string) bool {
	_, ok := r.vals[k]
	return ok
}

func (r *Record[V]) Delete(k string) {
	if _, ok := r.vals[k]; !ok {
		return
	}
	delete(r.vals, k)
	r.keys = slices.DeleteFunc(r.keys, func(x string) bool { return x == k })
}

func (r *Record[V]) Len() int { return len(r.keys) }

// Keys returns the keys in JS enumeration order.
func (r *Record[V]) Keys() []string { return jsKeyOrder(r.keys) }

// Each calls fn for every entry in JS enumeration order.
func (r *Record[V]) Each(fn func(k string, v V)) {
	for _, k := range r.Keys() {
		fn(k, r.vals[k])
	}
}

func (r Record[V]) MarshalJSON() ([]byte, error) {
	var buf bytes.Buffer
	buf.WriteByte('{')
	for i, k := range jsKeyOrder(r.keys) {
		if i > 0 {
			buf.WriteByte(',')
		}
		kb, _ := jsjson.Marshal(k, "")
		buf.Write(kb)
		buf.WriteByte(':')
		vb, err := jsjson.Marshal(r.vals[k], "")
		if err != nil {
			return nil, err
		}
		buf.Write(vb)
	}
	buf.WriteByte('}')
	return buf.Bytes(), nil
}

// UnmarshalJSON keeps the document's key order.
func (r *Record[V]) UnmarshalJSON(b []byte) error {
	*r = Record[V]{}
	return decodeObject(b, func(k string, raw json.RawMessage) error {
		var v V
		if err := json.Unmarshal(raw, &v); err != nil {
			return err
		}
		r.Set(k, v)
		return nil
	})
}

// Map is a JS Map serialized the way serializeInspectorState does it,
// `Array.from(map.entries())`: a JSON array of [key, value] pairs in
// insertion order (a Map, unlike an object, has no integer-key reordering).
type Map[V any] struct {
	keys []string
	vals map[string]V
}

func NewMap[V any]() *Map[V] { return &Map[V]{} }

func (m *Map[V]) Set(k string, v V) {
	if m.vals == nil {
		m.vals = map[string]V{}
	}
	if _, ok := m.vals[k]; !ok {
		m.keys = append(m.keys, k)
	}
	m.vals[k] = v
}

func (m *Map[V]) Get(k string) (V, bool) {
	v, ok := m.vals[k]
	return v, ok
}

func (m *Map[V]) At(k string) V { return m.vals[k] }

func (m *Map[V]) Has(k string) bool {
	_, ok := m.vals[k]
	return ok
}

func (m *Map[V]) Delete(k string) {
	if _, ok := m.vals[k]; !ok {
		return
	}
	delete(m.vals, k)
	m.keys = slices.DeleteFunc(m.keys, func(x string) bool { return x == k })
}

func (m *Map[V]) Len() int { return len(m.keys) }

// Keys returns the keys in insertion order.
func (m *Map[V]) Keys() []string { return slices.Clone(m.keys) }

func (m *Map[V]) Each(fn func(k string, v V)) {
	for _, k := range m.keys {
		fn(k, m.vals[k])
	}
}

func (m Map[V]) MarshalJSON() ([]byte, error) {
	var buf bytes.Buffer
	buf.WriteByte('[')
	for i, k := range m.keys {
		if i > 0 {
			buf.WriteByte(',')
		}
		buf.WriteByte('[')
		kb, _ := jsjson.Marshal(k, "")
		buf.Write(kb)
		buf.WriteByte(',')
		vb, err := jsjson.Marshal(m.vals[k], "")
		if err != nil {
			return nil, err
		}
		buf.Write(vb)
		buf.WriteByte(']')
	}
	buf.WriteByte(']')
	return buf.Bytes(), nil
}

func (m *Map[V]) UnmarshalJSON(b []byte) error {
	*m = Map[V]{}
	var pairs [][2]json.RawMessage
	if err := json.Unmarshal(b, &pairs); err != nil {
		return err
	}
	for _, p := range pairs {
		var k string
		var v V
		if err := json.Unmarshal(p[0], &k); err != nil {
			return err
		}
		if err := json.Unmarshal(p[1], &v); err != nil {
			return err
		}
		m.Set(k, v)
	}
	return nil
}

// Set is a JS Set<string>, serialized as `Array.from(set)`: an array in
// insertion order.
type Set struct {
	items []string
	seen  map[string]bool
}

func NewSet() *Set { return &Set{} }

func (s *Set) Add(v string) {
	if s.seen == nil {
		s.seen = map[string]bool{}
	}
	if !s.seen[v] {
		s.seen[v] = true
		s.items = append(s.items, v)
	}
}

func (s *Set) Has(v string) bool { return s.seen[v] }

func (s *Set) Delete(v string) {
	if !s.seen[v] {
		return
	}
	delete(s.seen, v)
	s.items = slices.DeleteFunc(s.items, func(x string) bool { return x == v })
}

func (s *Set) Len() int { return len(s.items) }

// Values returns the members in insertion order.
func (s *Set) Values() []string { return slices.Clone(s.items) }

func (s Set) MarshalJSON() ([]byte, error) {
	if s.items == nil {
		return []byte("[]"), nil
	}
	return jsjson.Marshal(s.items, "")
}

func (s *Set) UnmarshalJSON(b []byte) error {
	*s = Set{}
	var items []string
	if err := json.Unmarshal(b, &items); err != nil {
		return err
	}
	for _, v := range items {
		s.Add(v)
	}
	return nil
}

// isArrayIndex reports whether k is a canonical array index, the keys JS
// enumerates before all others: "0" or a digit string without a leading zero
// whose value is below 2^32 - 1.
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
	var idx []string
	for _, k := range keys {
		if _, ok := isArrayIndex(k); ok {
			idx = append(idx, k)
		}
	}
	if len(idx) == 0 {
		return keys
	}
	sort.Slice(idx, func(i, j int) bool {
		a, _ := isArrayIndex(idx[i])
		b, _ := isArrayIndex(idx[j])
		return a < b
	})
	out := idx
	for _, k := range keys {
		if _, ok := isArrayIndex(k); !ok {
			out = append(out, k)
		}
	}
	return out
}

func decodeObject(b []byte, fn func(k string, raw json.RawMessage) error) error {
	dec := json.NewDecoder(bytes.NewReader(b))
	t, err := dec.Token()
	if err != nil {
		return err
	}
	if t == nil {
		return nil
	}
	if t != json.Delim('{') {
		return &json.UnmarshalTypeError{Value: "non-object", Type: nil}
	}
	for dec.More() {
		t, err := dec.Token()
		if err != nil {
			return err
		}
		var raw json.RawMessage
		if err := dec.Decode(&raw); err != nil {
			return err
		}
		if err := fn(t.(string), raw); err != nil {
			return err
		}
	}
	return nil
}

// reorderObjectKeys rewrites the JSON object b so that the keys in first
// lead, in that order, the keys in last close it, in that order, and every
// other key keeps its relative order in between. Keys absent from b are
// skipped.
func reorderObjectKeys(b []byte, first, last []string) ([]byte, error) {
	vals := map[string]json.RawMessage{}
	var keys []string
	if err := decodeObject(b, func(k string, raw json.RawMessage) error {
		keys = append(keys, k)
		vals[k] = raw
		return nil
	}); err != nil {
		return nil, err
	}
	placed := map[string]bool{}
	for _, k := range first {
		placed[k] = true
	}
	for _, k := range last {
		placed[k] = true
	}
	order := make([]string, 0, len(keys))
	add := func(k string) {
		if _, ok := vals[k]; ok {
			order = append(order, k)
		}
	}
	for _, k := range first {
		add(k)
	}
	for _, k := range keys {
		if !placed[k] {
			order = append(order, k)
		}
	}
	for _, k := range last {
		add(k)
	}
	var buf bytes.Buffer
	buf.WriteByte('{')
	for i, k := range order {
		if i > 0 {
			buf.WriteByte(',')
		}
		kb, err := jsjson.Marshal(k, "")
		if err != nil {
			return nil, err
		}
		buf.Write(kb)
		buf.WriteByte(':')
		buf.Write(vals[k])
	}
	buf.WriteByte('}')
	return buf.Bytes(), nil
}

// overlayObjectKeys sets keys on the JSON object b the way JS assignment
// does: a key b already has keeps its position and takes the new value, a
// new key goes at the end, in the order given.
func overlayObjectKeys(b []byte, keys []string, vals map[string]any) ([]byte, error) {
	if len(keys) == 0 {
		return b, nil
	}
	var order []string
	raws := map[string]json.RawMessage{}
	if err := decodeObject(b, func(k string, raw json.RawMessage) error {
		order = append(order, k)
		raws[k] = raw
		return nil
	}); err != nil {
		return nil, err
	}
	for _, k := range keys {
		vb, err := jsjson.Marshal(vals[k], "")
		if err != nil {
			return nil, err
		}
		if _, ok := raws[k]; !ok {
			order = append(order, k)
		}
		raws[k] = vb
	}
	var buf bytes.Buffer
	buf.WriteByte('{')
	for i, k := range order {
		if i > 0 {
			buf.WriteByte(',')
		}
		kb, err := jsjson.Marshal(k, "")
		if err != nil {
			return nil, err
		}
		buf.Write(kb)
		buf.WriteByte(':')
		buf.Write(raws[k])
	}
	buf.WriteByte('}')
	return buf.Bytes(), nil
}
