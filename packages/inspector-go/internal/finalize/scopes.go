package finalize

import (
	"encoding/json"
	"sort"
	"strings"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// applyDeclaredScopes (apply-declared-scopes.ts) and the scope / role
// validators of utils/post-process.ts.

// applyDeclaredScopes folds `declareScopes` ids into scopes.definitions.
func applyDeclaredScopes(st *state.State) {
	if st.Scopes.Declared == nil {
		return
	}
	st.Scopes.Declared.Each(func(id, sourceFile string) {
		segments := strings.Split(id, ":")
		rootName, rest := segments[0], segments[1:]
		idx := -1
		for i, r := range st.Scopes.Definitions {
			if name, ok := stringValue(rawMember(r, "name")); ok && name == rootName {
				idx = i
				break
			}
		}
		if idx < 0 {
			root := &object{}
			root.Set("name", encode(rootName))
			root.Set("sourceFile", encode(sourceFile))
			st.Scopes.Definitions = append(st.Scopes.Definitions, encode(root))
			idx = len(st.Scopes.Definitions) - 1
		}
		st.Scopes.Definitions[idx] = ensureScopePath(st.Scopes.Definitions[idx], rest)
	})
}

// ensureScopePath is `level.scopes ??= {}; level = level.scopes[segment] ??= {}`
// down the segments, on a Raw node.
func ensureScopePath(node state.Raw, segments []string) state.Raw {
	if len(segments) == 0 {
		return node
	}
	o := decodeObject(node)
	scopesRaw, ok := o.Get("scopes")
	if !ok || !truthy(json.RawMessage(scopesRaw)) {
		scopesRaw = state.Raw("{}")
	}
	scopes := decodeObject(scopesRaw)
	child, ok := scopes.Get(segments[0])
	if !ok || !truthy(json.RawMessage(child)) {
		child = state.Raw("{}")
	}
	scopes.Set(segments[0], ensureScopePath(child, segments[1:]))
	o.Set("scopes", encode(scopes))
	return encode(o)
}

// flattenScopeIds is `flattenScopeDefinitions(definitions).map((s) => s.id)`:
// every node, depth-first, deduplicated.
func flattenScopeIds(definitions state.List[state.Raw]) *orderedSet {
	ids := &orderedSet{}
	var walk func(nodes state.Raw, prefix string)
	walk = func(nodes state.Raw, prefix string) {
		decodeObject(nodes).Each(func(segment string, node state.Raw) {
			id := prefix + ":" + segment
			ids.add(id)
			walk(state.Raw(rawMember(node, "scopes")), id)
		})
	}
	for _, def := range definitions {
		name := templateValue(rawMember(def, "name"))
		ids.add(name)
		walk(state.Raw(rawMember(def, "scopes")), name)
	}
	return ids
}

func declaredForm(scope string) string {
	if strings.HasSuffix(scope, ":*") {
		return scope[:len(scope)-2]
	}
	return scope
}

func validateScopeReferences(log *diag.Logger, st *state.State) {
	declared := flattenScopeIds(st.Scopes.Definitions)
	st.Functions.Meta.Each(func(funcName string, meta *state.FunctionMeta) {
		if meta == nil {
			return
		}
		for _, scope := range meta.Scopes {
			if scope == "*" {
				log.Critical(diag.InvalidValue, "Function '"+funcName+"' requires the bare wildcard scope '*'. A function must require a specific scope — '*' is only meaningful as a grant.")
				continue
			}
			if !declared.has(declaredForm(scope)) {
				log.Critical(diag.InvalidValue, "Function '"+funcName+"' requires scope '"+scope+"' which is not declared. Declare it with defineScope. Available scopes: "+orNone(declared.items))
			}
		}
	})
}

type namedScopes struct {
	Name   json.RawMessage `json:"name"`
	Scopes []string        `json:"scopes"`
}

func validateSystemRoleScopes(log *diag.Logger, st *state.State) {
	if len(st.SystemRoles.Definitions) == 0 {
		return
	}
	declared := flattenScopeIds(st.Scopes.Definitions)
	for _, r := range st.SystemRoles.Definitions {
		role := decode[namedScopes](r)
		name := templateValue(role.Name)
		for _, scope := range role.Scopes {
			if scope == "*" {
				log.Critical(diag.InvalidValue, "System role '"+name+"' grants the bare wildcard scope '*'. Grant the roots it should cover instead — '*' hides what the role actually confers.")
				continue
			}
			if !declared.has(declaredForm(scope)) {
				log.Critical(diag.InvalidValue, "System role '"+name+"' grants scope '"+scope+"' which is not declared. Declare it with defineScope. Available scopes: "+orNone(declared.items))
			}
		}
	}
}

func validateVirtualUserRoles(log *diag.Logger, st *state.State) {
	if len(st.VirtualUsers.Definitions) == 0 {
		return
	}
	declared := definitionIds(st.SystemRoles.Definitions, "")
	for _, r := range st.VirtualUsers.Definitions {
		vu := decode[struct {
			ID    json.RawMessage `json:"id"`
			Roles []string        `json:"roles"`
		}](r)
		for _, role := range vu.Roles {
			if declared.has(role) {
				continue
			}
			available := append([]string(nil), declared.items...)
			sort.Strings(available)
			log.Critical(diag.InvalidValue, "VirtualUser '"+templateValue(vu.ID)+"' holds role '"+role+"', which is not declared with defineSystemRole. "+
				"A virtual user may only name a system role — a role composed in the console can be deleted, and the virtual user would go on claiming to test it. "+
				"Declared roles: "+orNone(available))
		}
	}
}
