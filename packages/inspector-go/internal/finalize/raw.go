package finalize

import (
	"encoding/json"
	"strings"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/jsjson"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// Most sections finalize reads are still state.Raw (their visitor groups are
// unported, or they are plain pass-through data). These helpers read the few
// members a step needs without retyping the section.

// decode unmarshals r into a T; a missing, null or malformed value gives the
// zero T, as an absent member reads `undefined` in TS.
func decode[T any](r state.Raw) T {
	var v T
	if len(r) == 0 {
		return v
	}
	_ = json.Unmarshal(r, &v)
	return v
}

// object is a Raw JSON object with its key order, for steps that rewrite one.
type object = state.Record[state.Raw]

func decodeObject(r state.Raw) *object {
	o := &object{}
	if len(r) > 0 {
		_ = json.Unmarshal(r, o)
	}
	return o
}

func encode(v any) state.Raw { return state.Raw(jsjson.MustMarshal(v)) }

// isTrue is `x === true`.
func isTrue(r json.RawMessage) bool { return strings.TrimSpace(string(r)) == "true" }

// isFalse is `x === false`.
func isFalse(r json.RawMessage) bool { return strings.TrimSpace(string(r)) == "false" }

// isArray is Array.isArray(x).
func isArray(r json.RawMessage) bool {
	s := strings.TrimSpace(string(r))
	return strings.HasPrefix(s, "[")
}

// jsString interpolates an optional string the way a template literal does.
func jsString(s *string) string {
	if s == nil {
		return "undefined"
	}
	return *s
}

// templateValue interpolates any JSON value as `${x}` would.
func templateValue(r json.RawMessage) string {
	s := strings.TrimSpace(string(r))
	if s == "" {
		return "undefined"
	}
	switch s[0] {
	case '"':
		var v string
		_ = json.Unmarshal(r, &v)
		return v
	case '{':
		return "[object Object]"
	case '[':
		var items []json.RawMessage
		_ = json.Unmarshal(r, &items)
		parts := make([]string, len(items))
		for i, it := range items {
			if t := strings.TrimSpace(string(it)); t != "null" {
				parts[i] = templateValue(it)
			}
		}
		return strings.Join(parts, ",")
	}
	return s
}

// servicesMeta is FunctionServicesMeta as found in Raw sections.
type servicesMeta struct {
	Optimized bool      `json:"optimized"`
	Services  *[]string `json:"services"`
}

type wiresMeta struct {
	Optimized bool `json:"optimized"`
}

// definitionMeta is the part of an InspectorMiddlewareDefinition /
// InspectorPermissionDefinition finalize reads.
type definitionMeta struct {
	Services   *servicesMeta `json:"services"`
	Wires      *wiresMeta    `json:"wires"`
	SourceFile string        `json:"sourceFile"`
	Position   int           `json:"position"`
}

// groupMeta is the part of a MiddlewareGroupMeta finalize reads.
type groupMeta struct {
	SourceFile              string         `json:"sourceFile"`
	Services                *servicesMeta  `json:"services"`
	AdditionalRegistrations []registration `json:"additionalRegistrations"`
}

type registration struct {
	SourceFile string `json:"sourceFile"`
}

// wireRef is a MiddlewareMetadata entry in a Raw wiring's middleware list.
type wireRef struct {
	Type  string  `json:"type"`
	Tag   string  `json:"tag"`
	Route *string `json:"route"`
}

type withMiddleware struct {
	Middleware []wireRef `json:"middleware"`
}

// addonDecl is a wireAddonDeclarations entry.
type addonDecl struct {
	Package             *string                        `json:"package"`
	File                *string                        `json:"file"`
	Remote              json.RawMessage                `json:"remote"`
	SecretOverrides     *state.Record[json.RawMessage] `json:"secretOverrides"`
	SecretGrants        []string                       `json:"secretGrants"`
	VariableOverrides   *state.Record[json.RawMessage] `json:"variableOverrides"`
	CredentialOverrides *state.Record[json.RawMessage] `json:"credentialOverrides"`
	CredentialGrants    []string                       `json:"credentialGrants"`
	Uses                *state.Record[json.RawMessage] `json:"uses"`
	ContentBucket       *string                        `json:"contentBucket"`
	ContentGrants       *state.Record[json.RawMessage] `json:"contentGrants"`
	AuthCredentialId    *string                        `json:"authCredentialId"`
	AuthSecretId        *string                        `json:"authSecretId"`
	Auth                json.RawMessage                `json:"auth"`
	Scopes              []json.RawMessage              `json:"scopes"`
	Expose              json.RawMessage                `json:"expose"`
	Tags                []string                       `json:"tags"`
}

func (d addonDecl) pkg() string {
	if d.Package == nil {
		return ""
	}
	return *d.Package
}

// remote is `decl.remote` read for truthiness.
func (d addonDecl) remote() bool { return truthy(d.Remote) }

// gated is `decl.auth === true || (decl.scopes?.length ?? 0) > 0`.
func (d addonDecl) gated() bool { return isTrue(d.Auth) || len(d.Scopes) > 0 }

type addonEntry struct {
	namespace string
	decl      addonDecl
}

func addonDecls(st *state.State) []addonEntry {
	var out []addonEntry
	st.RPC.WireAddonDeclarations.Each(func(ns string, r state.Raw) {
		out = append(out, addonEntry{ns, decode[addonDecl](r)})
	})
	return out
}

// truthy is JS truthiness of a JSON value.
func truthy(r json.RawMessage) bool {
	s := strings.TrimSpace(string(r))
	switch s {
	case "", "null", "false", "0", `""`, "-0":
		return false
	}
	return true
}

// stringValue is `typeof x === 'string' ? x : undefined`.
func stringValue(r json.RawMessage) (string, bool) {
	s := strings.TrimSpace(string(r))
	if !strings.HasPrefix(s, `"`) {
		return "", false
	}
	var v string
	_ = json.Unmarshal(r, &v)
	return v, true
}

// orNone is `list.join(', ') || 'none'`.
func orNone(list []string) string {
	if joined := strings.Join(list, ", "); joined != "" {
		return joined
	}
	return "none"
}

func quoteEach(list []string) []string {
	out := make([]string, len(list))
	for i, s := range list {
		out[i] = "'" + s + "'"
	}
	return out
}

// orderedSet is a JS Set<string> built up in insertion order.
type orderedSet struct {
	items []string
	seen  map[string]bool
}

func (s *orderedSet) add(v string) {
	if s.seen == nil {
		s.seen = map[string]bool{}
	}
	if !s.seen[v] {
		s.seen[v] = true
		s.items = append(s.items, v)
	}
}

func (s *orderedSet) has(v string) bool { return s.seen[v] }

// rawRecord re-encodes a typed record as Raw values, for the steps written
// against the untyped sections.
func rawRecord[V any](in state.Record[V]) state.Record[state.Raw] {
	var out state.Record[state.Raw]
	in.Each(func(k string, v V) { out.Set(k, encode(v)) })
	return out
}

// rawMap is rawRecord for a Map.
func rawMap[V any](in state.Map[V]) state.Map[state.Raw] {
	var out state.Map[state.Raw]
	in.Each(func(k string, v V) { out.Set(k, encode(v)) })
	return out
}
