// Package typesmap ports types-map.ts. Both maps keep JS Map semantics:
// iteration is insertion order and re-setting a key keeps its position, which
// Exists depends on (it returns the first entry that matches).
package typesmap

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/jsjson"
)

type Entry struct {
	OriginalName string  `json:"originalName"`
	Path         *string `json:"path"`
}

type CustomType struct {
	Type       string   `json:"type"`
	References []string `json:"references"`
}

type TypesMap struct {
	keys        []string
	entries     map[string]Entry
	customKeys  []string
	customTypes map[string]CustomType
}

func New() *TypesMap {
	return &TypesMap{entries: map[string]Entry{}, customTypes: map[string]CustomType{}}
}

func (m *TypesMap) set(key string, e Entry) {
	if m.entries == nil {
		m.entries = map[string]Entry{}
	}
	if _, ok := m.entries[key]; !ok {
		m.keys = append(m.keys, key)
	}
	m.entries[key] = e
}

func (m *TypesMap) AddCustomType(name, typ string, references []string) {
	if m.customTypes == nil {
		m.customTypes = map[string]CustomType{}
	}
	if _, ok := m.customTypes[name]; !ok {
		m.customKeys = append(m.customKeys, name)
	}
	if references == nil {
		references = []string{}
	}
	m.customTypes[name] = CustomType{Type: typ, References: references}
}

func (m *TypesMap) AddType(originalName, path string) {
	m.set(originalName, Entry{originalName, &path})
}

// AddUniqueType names the type by a digest of its path alone, so the alias is
// independent of traversal order.
func (m *TypesMap) AddUniqueType(originalName, path string) string {
	sum := sha256.Sum256([]byte(path))
	unique := originalName + "_" + hex.EncodeToString(sum[:])[:12]
	m.set(unique, Entry{originalName, &path})
	return unique
}

// Exists returns the key of the first entry with this name and path, or "".
func (m *TypesMap) Exists(originalName, path string) string {
	for _, k := range m.keys {
		if e := m.entries[k]; e.Path != nil && *e.Path == path && e.OriginalName == originalName {
			return k
		}
	}
	return ""
}

func (m *TypesMap) Keys() []string { return append([]string(nil), m.keys...) }

func (m *TypesMap) Entry(key string) (Entry, bool) {
	e, ok := m.entries[key]
	return e, ok
}

func (m *TypesMap) CustomTypeKeys() []string { return append([]string(nil), m.customKeys...) }

func (m *TypesMap) CustomType(name string) (CustomType, bool) {
	c, ok := m.customTypes[name]
	return c, ok
}

var primitiveNames = map[string]bool{
	"string": true, "number": true, "boolean": true, "null": true,
	"undefined": true, "void": true, "unknown": true, "never": true,
}

// TypeMeta is getTypeMeta's result.
type TypeMeta struct {
	OriginalName string
	UniqueName   string
	Path         *string
}

// GetUniqueName is TypesMap.getUniqueName.
func (m *TypesMap) GetUniqueName(name string) (string, error) {
	tm, err := m.GetTypeMeta(name)
	return tm.UniqueName, err
}

// GetTypeMeta is TypesMap.getTypeMeta; the TS throw becomes an error.
func (m *TypesMap) GetTypeMeta(name string) (TypeMeta, error) {
	if primitiveNames[name] {
		return TypeMeta{name, name, nil}, nil
	}
	if _, ok := m.customTypes[name]; ok {
		return TypeMeta{name, name, nil}, nil
	}
	meta, ok := m.entries[name]
	if !ok {
		meta, ok = m.findByOriginal(name)
	}
	if !ok {
		return TypeMeta{}, fmt.Errorf("Type %s not found in typesMap", name)
	}
	unique, err := m.squash()(name)
	if err != nil {
		return TypeMeta{}, err
	}
	return TypeMeta{OriginalName: meta.OriginalName, UniqueName: unique, Path: meta.Path}, nil
}

func (m *TypesMap) findByOriginal(name string) (Entry, bool) {
	for _, k := range m.keys {
		if e := m.entries[k]; e.OriginalName == name {
			return e, true
		}
	}
	return Entry{}, false
}

func (m *TypesMap) squash() func(string) (string, error) {
	occurrences := map[string]map[string]bool{}
	for _, k := range m.keys {
		e := m.entries[k]
		if e.Path != nil && *e.Path != "" {
			if occurrences[e.OriginalName] == nil {
				occurrences[e.OriginalName] = map[string]bool{}
			}
			occurrences[e.OriginalName][*e.Path] = true
		}
	}
	duplicates := map[string]bool{}
	for _, k := range m.keys {
		e := m.entries[k]
		if e.Path == nil || *e.Path == "" {
			continue
		}
		if len(occurrences[e.OriginalName]) > 1 {
			duplicates[k] = true
		}
	}
	return func(unique string) (string, error) {
		if duplicates[unique] {
			return unique, nil
		}
		switch unique {
		case "string", "number", "boolean", "null":
			return unique, nil
		}
		if e, ok := m.entries[unique]; ok {
			return e.OriginalName, nil
		}
		if e, ok := m.findByOriginal(unique); ok {
			return e.OriginalName, nil
		}
		return "", fmt.Errorf("Type %s not found in typesMap", unique)
	}
}

// MarshalJSON writes serializeTypesMap's `{ map, customTypes }`.
func (m *TypesMap) MarshalJSON() ([]byte, error) {
	var buf bytes.Buffer
	buf.WriteString(`{"map":[`)
	for i, k := range m.keys {
		if i > 0 {
			buf.WriteByte(',')
		}
		buf.WriteByte('[')
		buf.Write(jsjson.MustMarshal(k))
		buf.WriteByte(',')
		buf.Write(jsjson.MustMarshal(m.entries[k]))
		buf.WriteByte(']')
	}
	buf.WriteString(`],"customTypes":[`)
	for i, k := range m.customKeys {
		if i > 0 {
			buf.WriteByte(',')
		}
		buf.WriteByte('[')
		buf.Write(jsjson.MustMarshal(k))
		buf.WriteByte(',')
		buf.Write(jsjson.MustMarshal(m.customTypes[k]))
		buf.WriteByte(']')
	}
	buf.WriteString(`]}`)
	return buf.Bytes(), nil
}

func (m *TypesMap) UnmarshalJSON(b []byte) error {
	var raw struct {
		Map         [][2]json.RawMessage `json:"map"`
		CustomTypes [][2]json.RawMessage `json:"customTypes"`
	}
	if err := json.Unmarshal(b, &raw); err != nil {
		return err
	}
	*m = *New()
	for _, p := range raw.Map {
		var k string
		var e Entry
		if err := json.Unmarshal(p[0], &k); err != nil {
			return err
		}
		if err := json.Unmarshal(p[1], &e); err != nil {
			return err
		}
		m.set(k, e)
	}
	for _, p := range raw.CustomTypes {
		var k string
		var c CustomType
		if err := json.Unmarshal(p[0], &k); err != nil {
			return err
		}
		if err := json.Unmarshal(p[1], &c); err != nil {
			return err
		}
		m.AddCustomType(k, c.Type, c.References)
	}
	return nil
}
