package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
)

// TypesMap is a port of types-map.ts. Both maps keep JS Map semantics:
// iteration is insertion order and re-setting a key keeps its position,
// which `exists` depends on (it returns the first entry that matches).
type TypesMap struct {
	keys        []string
	entries     map[string]typeEntry
	customKeys  []string
	customTypes map[string]customType
}

type typeEntry struct {
	OriginalName string `json:"originalName"`
	Path         string `json:"path"`
}

type customType struct {
	Type       string   `json:"type"`
	References []string `json:"references"`
}

func newTypesMap() *TypesMap {
	return &TypesMap{entries: map[string]typeEntry{}, customTypes: map[string]customType{}}
}

func (m *TypesMap) set(key string, e typeEntry) {
	if _, ok := m.entries[key]; !ok {
		m.keys = append(m.keys, key)
	}
	m.entries[key] = e
}

func (m *TypesMap) addCustomType(name, typ string, references []string) {
	if _, ok := m.customTypes[name]; !ok {
		m.customKeys = append(m.customKeys, name)
	}
	if references == nil {
		references = []string{}
	}
	m.customTypes[name] = customType{Type: typ, References: references}
}

func (m *TypesMap) addType(originalName, path string) {
	m.set(originalName, typeEntry{originalName, path})
}

// addUniqueType names the type by a digest of its path alone, so the alias is
// independent of traversal order.
func (m *TypesMap) addUniqueType(originalName, path string) string {
	sum := sha256.Sum256([]byte(path))
	unique := originalName + "_" + hex.EncodeToString(sum[:])[:12]
	m.set(unique, typeEntry{originalName, path})
	return unique
}

func (m *TypesMap) exists(originalName, path string) string {
	for _, k := range m.keys {
		if e := m.entries[k]; e.Path == path && e.OriginalName == originalName {
			return k
		}
	}
	return ""
}

func (m *TypesMap) MarshalJSON() ([]byte, error) {
	mapped := make([][2]any, 0, len(m.keys))
	for _, k := range m.keys {
		mapped = append(mapped, [2]any{k, m.entries[k]})
	}
	custom := make([][2]any, 0, len(m.customKeys))
	for _, k := range m.customKeys {
		custom = append(custom, [2]any{k, m.customTypes[k]})
	}
	return json.Marshal(map[string]any{"map": mapped, "customTypes": custom})
}

func dedupe(in []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, s := range in {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}
