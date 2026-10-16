package schemas

import (
	"strings"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// primitiveTypeToSchema is the fallback for a custom type the generator has no
// declaration for; nil means no schema.
func primitiveTypeToSchema(typ string) state.Raw {
	switch strings.TrimSpace(typ) {
	case "boolean", "false | true", "true | false":
		return state.Raw(`{"type":"boolean"}`)
	case "true":
		return state.Raw(`{"const":true}`)
	case "false":
		return state.Raw(`{"const":false}`)
	case "string":
		return state.Raw(`{"type":"string"}`)
	case "number":
		return state.Raw(`{"type":"number"}`)
	case "null":
		return state.Raw(`{"type":"null"}`)
	case "any", "unknown":
		return state.Raw(`{}`)
	}
	return nil
}
