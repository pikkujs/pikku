package finalize

import (
	"encoding/json"
	"strconv"
	"strings"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/typesmap"
)

// Ports of the type, schema and middleware-group steps of utils/post-process.ts.

// uniqueNameOr is `try { typesMap.getUniqueName(name) } catch { name }`.
func uniqueNameOr(tm *typesmap.TypesMap, name string) string {
	if tm == nil {
		return name
	}
	unique, err := tm.GetUniqueName(name)
	if err != nil {
		return name
	}
	return unique
}

func first(list []string) string {
	if len(list) == 0 {
		return ""
	}
	return list[0]
}

func computeResolvedIOTypes(st *state.State) {
	tm := st.Functions.TypesMap
	st.Functions.Meta.Each(func(id string, meta *state.FunctionMeta) {
		if meta == nil {
			return
		}
		inputType, outputType := "null", "null"
		if in := first(meta.Inputs); in != "" {
			inputType = uniqueNameOr(tm, in)
		}
		if out := first(meta.Outputs); out != "" {
			outputType = uniqueNameOr(tm, out)
		}
		st.ResolvedIOTypes.Set(id, state.ResolvedIOType{InputType: inputType, OutputType: outputType})

		if meta.InputSchemaName != nil && *meta.InputSchemaName != "" && inputType != "null" {
			v := inputType
			meta.InputSchemaName = &v
		}
		if meta.OutputSchemaName != nil && *meta.OutputSchemaName != "" && outputType != "null" {
			v := outputType
			meta.OutputSchemaName = &v
		}
		if meta.Inputs != nil {
			for i, name := range meta.Inputs {
				meta.Inputs[i] = uniqueNameOr(tm, name)
			}
		}
		if meta.Outputs != nil {
			for i, name := range meta.Outputs {
				meta.Outputs[i] = uniqueNameOr(tm, name)
			}
		}
	})
}

// groupMetaKeys is serializeGroupMap's literal, in its key order.
var groupMetaKeys = []string{"exportName", "sourceFile", "position", "services", "count", "instanceIds", "isFactory"}

func serializeGroupMap(groups state.Map[state.Raw]) state.Record[state.Raw] {
	var out state.Record[state.Raw]
	groups.Each(func(key string, r state.Raw) {
		in := decodeObject(r)
		o := &object{}
		for _, k := range groupMetaKeys {
			if v, ok := in.Get(k); ok {
				o.Set(k, v)
			}
		}
		if v, ok := in.Get("additionalRegistrations"); ok && truthy(json.RawMessage(v)) {
			o.Set("additionalRegistrations", v)
		}
		out.Set(key, encode(o))
	})
	return out
}

func computeMiddlewareGroupsMeta(st *state.State) {
	st.MiddlewareGroupsMeta = state.MiddlewareGroupsMeta{
		Definitions: rawRecord(st.Middleware.Definitions),
		Instances:   rawRecord(st.Middleware.Instances),
		HTTPGroups:  serializeGroupMap(rawMap(st.HTTP.RouteMiddleware)),
		TagGroups:   serializeGroupMap(rawMap(st.Middleware.TagMiddleware)),
		ChannelMiddleware: state.ChannelMiddlewareGroups{
			Definitions: rawRecord(st.ChannelMiddleware.Definitions),
			Instances:   rawRecord(st.ChannelMiddleware.Instances),
			TagGroups:   serializeGroupMap(rawMap(st.ChannelMiddleware.TagMiddleware)),
		},
	}
}

func computePermissionsGroupsMeta(st *state.State) {
	st.PermissionsGroupsMeta = state.PermissionsGroupsMeta{Definitions: rawRecord(st.Permissions.Definitions)}
}

var primitiveTypes = map[string]bool{
	"boolean": true, "string": true, "number": true, "null": true, "undefined": true,
	"void": true, "any": true, "unknown": true, "never": true,
}

func computeRequiredSchemas(st *state.State, opts Options) {
	tm := st.Functions.TypesMap
	var required state.Set
	st.Functions.Meta.Each(func(_ string, meta *state.FunctionMeta) {
		if meta == nil {
			return
		}
		for _, name := range []string{first(meta.Inputs), first(meta.Outputs)} {
			if name == "" {
				continue
			}
			if resolved := uniqueNameOr(tm, name); resolved != "" && !primitiveTypes[resolved] {
				required.Add(resolved)
			}
		}
	})
	if tm != nil {
		for _, k := range tm.CustomTypeKeys() {
			required.Add(k)
		}
	}
	if opts.SchemaConfig != nil {
		for _, s := range opts.SchemaConfig.SchemasFromTypes {
			required.Add(s)
		}
	}
	for _, k := range st.SchemaLookup.Keys() {
		required.Add(k)
	}
	st.RequiredSchemas = required
}

// unresolvedSchemaReferences is post-process.ts unresolvedSchemaReferences.
func unresolvedSchemaReferences(st *state.State) []string {
	tm := st.Functions.TypesMap
	var unresolved []string
	st.Functions.Meta.Each(func(funcName string, meta *state.FunctionMeta) {
		if meta == nil {
			return
		}
		for _, role := range [2]struct{ name, declared string }{{"input", first(meta.Inputs)}, {"output", first(meta.Outputs)}} {
			if role.declared == "" || primitiveTypes[role.declared] {
				continue
			}
			resolved := uniqueNameOr(tm, role.declared)
			if primitiveTypes[resolved] || st.Schemas.Has(resolved) {
				continue
			}
			unresolved = append(unresolved, funcName+"."+role.name+" → '"+resolved+"'")
		}
	})
	return unresolved
}

func validateSchemaReferences(log *diag.Logger, st *state.State) {
	unresolved := unresolvedSchemaReferences(st)
	n := len(unresolved)
	if n == 0 {
		return
	}
	plural := func(one, many string) string {
		if n == 1 {
			return one
		}
		return many
	}
	log.Diagnostic(diag.Error, diag.SchemaReferenceUnresolved,
		strconv.Itoa(n)+" function contract"+plural("", "s")+" "+
			"name"+plural("s", "")+" a schema that was never generated, so "+
			"calling "+plural("it", "them")+" fails at runtime with "+
			"MissingSchemaError: "+strings.Join(unresolved, ", ")+". "+
			"The usual cause is a named type used as the function's input/output that "+
			"is declared but not exported — export it, or inline the type at the call site.")
}
