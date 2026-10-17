package schema

import (
	"fmt"
	"net/url"
	"sort"
	"strings"
)

const definitionPrefix = "#/definitions/"

// RemoveUnreachable filters definitions down to those reachable from the
// root definition (src/Utils/removeUnreachable.ts). It returns the names in
// the order TS's Set first meets them, which is the key order of the
// `definitions` object TS writes.
func RemoveUnreachable(root *Definition, definitions map[string]*Definition) []string {
	if root == nil {
		names := make([]string, 0, len(definitions))
		for name := range definitions {
			names = append(names, name)
		}
		sort.Strings(names)
		return names
	}
	reachable := &reachableSet{seen: map[string]bool{}}
	addReachable(root, definitions, reachable)
	return reachable.order
}

type reachableSet struct {
	seen  map[string]bool
	order []string
}

func addReachable(d *Definition, definitions map[string]*Definition, reachable *reachableSet) {
	if d == nil {
		return
	}
	switch {
	case d.Ref != "":
		if !strings.HasPrefix(d.Ref, "#") {
			return
		}
		name := decodeRef(strings.TrimPrefix(d.Ref, definitionPrefix))
		if reachable.seen[name] {
			return
		}
		reachable.seen[name] = true
		reachable.order = append(reachable.order, name)
		ref, ok := definitions[name]
		if !ok {
			panic(fmt.Errorf("encountered a reference to a missing definition %q, this is a bug", d.Ref))
		}
		addReachable(ref, definitions, reachable)
	case d.AnyOf != nil:
		for _, sub := range d.AnyOf {
			addReachable(sub, definitions, reachable)
		}
	case d.AllOf != nil:
		for _, sub := range d.AllOf {
			addReachable(sub, definitions, reachable)
		}
	case d.OneOf != nil:
		for _, sub := range d.OneOf {
			addReachable(sub, definitions, reachable)
		}
	case d.Not != nil:
		addReachable(d.Not, definitions, reachable)
	case d.HasType("object"):
		for _, prop := range d.Properties.All() {
			addReachable(prop, definitions, reachable)
		}
		if ap, ok := d.AdditionalProperties.(*Definition); ok {
			addReachable(ap, definitions, reachable)
		}
	case d.HasType("array"):
		switch items := d.Items.(type) {
		case []*Definition:
			for _, item := range items {
				addReachable(item, definitions, reachable)
			}
		case *Definition:
			addReachable(items, definitions, reachable)
		}
		if ai, ok := d.AdditionalItems.(*Definition); ok {
			addReachable(ai, definitions, reachable)
		}
	case d.Then != nil:
		addReachable(d.Then, definitions, reachable)
	}
}

func decodeRef(ref string) string {
	decoded, err := url.PathUnescape(ref)
	if err != nil {
		return ref
	}
	return decoded
}

// EncodeRef URI-encodes a definition name for use in a $ref, matching
// encodeURIComponent semantics used by the TypeScript implementation.
func EncodeRef(name string) string {
	// encodeURIComponent escapes everything except A-Za-z0-9 - _ . ! ~ * ' ( )
	var sb strings.Builder
	for _, b := range []byte(name) {
		switch {
		case b >= 'A' && b <= 'Z', b >= 'a' && b <= 'z', b >= '0' && b <= '9':
			sb.WriteByte(b)
		case b == '-' || b == '_' || b == '.' || b == '!' || b == '~' || b == '*' || b == '\'' || b == '(' || b == ')':
			sb.WriteByte(b)
		default:
			fmt.Fprintf(&sb, "%%%02X", b)
		}
	}
	return sb.String()
}
