package finalize

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// Port of utils/serialize-openapi-json.ts generateOpenAPISpec.

// OpenAPIError is one entry of @pikku/core's error registry
// (pikkuState(null, 'misc', 'errors')), which the TS wrapper reads in its own
// process and passes as openAPI.errors.
type OpenAPIError struct {
	Name    string  `json:"name"`
	Status  float64 `json:"status"`
	Message any     `json:"message"`
}

var routeParamRe = regexp.MustCompile(`:(\w+)`)

func isPrimitiveSchemaName(s string) bool {
	return s == "boolean" || s == "string" || s == "number"
}

// GenerateOpenAPISpec builds state.openAPISpec from options.openAPI
// (`{ additionalInfo, errors }`).
func GenerateOpenAPISpec(log *diag.Logger, st *state.State, openAPI json.RawMessage) error {
	opts, err := Parse(openAPI)
	if err != nil {
		return fmt.Errorf("openAPI: %w", err)
	}
	info := AsObject(AsObject(opts).Get("additionalInfo"))
	if info == nil {
		return fmt.Errorf("TypeError: Cannot read properties of undefined (reading 'info')")
	}
	var registry []OpenAPIError
	if raw := AsObject(opts).Get("errors"); !Nullish(raw) {
		b, _ := Marshal(raw)
		if err := json.Unmarshal(b, &registry); err != nil {
			return fmt.Errorf("openAPI.errors: %w", err)
		}
	}

	paths := NewObject()
	for _, method := range st.HTTP.Meta.Keys() {
		routes := st.HTTP.Meta.At(method)
		if routes == nil {
			continue
		}
		for _, routeKey := range routes.Keys() {
			meta := routes.At(routeKey)
			if meta == nil {
				continue
			}
			fn := st.Functions.Meta.At(meta.PikkuFuncId)
			if fn == nil {
				log.Error(fmt.Sprintf("• No function metadata found for '%s' in route '%s'.", meta.PikkuFuncId, meta.Route))
				continue
			}
			var output any = Undefined
			if fn.Outputs != nil {
				if len(fn.Outputs) > 0 {
					output = fn.Outputs[0]
				}
			}
			path := routeParamRe.ReplaceAllString(meta.Route, "{$1}")
			if !Truthy(paths.Get(path)) {
				paths.Set(path, NewObject())
			}

			responses := NewObject()
			for _, e := range meta.Errors {
				for _, r := range registry {
					if r.Name == e {
						responses.Set(NumberString(r.Status), Obj("description", r.Message))
						break
					}
				}
			}
			var content any = Undefined
			if Truthy(output) {
				name := output.(string)
				var schema *Object
				if isPrimitiveSchemaName(name) {
					schema = Obj("type", name)
				} else {
					schema = Obj("$ref", "#/components/schemas/"+name)
				}
				content = Obj("application/json", Obj("schema", schema))
			}
			responses.Set("200", Obj("description", "Successful response", "content", content))

			description := ""
			if meta.Description != nil {
				description = *meta.Description
			}
			if description == "" {
				description = fmt.Sprintf("This endpoint handles the %s request for the route %s.", strings.ToUpper(meta.Method), meta.Route)
			}
			var tags []any
			if meta.Tags != nil {
				tags = make([]any, len(meta.Tags))
				for i, t := range meta.Tags {
					tags[i] = t
				}
			} else {
				seg := ""
				if parts := strings.Split(meta.Route, "/"); len(parts) > 1 {
					seg = parts[1]
				}
				if seg == "" {
					seg = "default"
				}
				tags = []any{seg}
			}
			parameters := []any{}
			for _, p := range meta.Params {
				parameters = append(parameters, Obj("name", p, "in", "path", "required", true, "schema", Obj("type", "string")))
			}
			for _, q := range meta.Query {
				parameters = append(parameters, Obj("name", q, "in", "query", "required", false, "schema", Obj("type", "string")))
			}
			operation := Obj("description", description, "tags", tags, "parameters", parameters, "responses", responses)
			AsObject(paths.Get(path)).Set(meta.Method, operation)
		}
	}

	schemas, err := convertSchemasToBodyPayloads(st)
	if err != nil {
		return err
	}
	securitySchemes := info.Get("securitySchemes")
	if !Truthy(securitySchemes) {
		securitySchemes = Obj(
			"ApiKeyAuth", Obj("type", "apiKey", "in", "header", "name", "x-api-key"),
			"BearerAuth", Obj("type", "http", "scheme", "bearer"),
		)
	}
	security := info.Get("security")
	if !Truthy(security) {
		security = []any{Obj("ApiKeyAuth", []any{}), Obj("BearerAuth", []any{})}
	}
	spec := Obj(
		"openapi", "3.1.0",
		"info", info.Get("info"),
		"servers", info.Get("servers"),
		"paths", paths,
		"components", Obj(
			"schemas", schemas,
			"responses", NewObject(),
			"parameters", NewObject(),
			"examples", NewObject(),
			"requestBodies", NewObject(),
			"headers", NewObject(),
			"securitySchemes", securitySchemes,
		),
		"security", security,
		"tags", info.Get("tags"),
		"externalDocs", info.Get("externalDocs"),
	)
	b, err := Marshal(spec)
	if err != nil {
		return err
	}
	st.OpenAPISpec = state.Raw(b)
	return nil
}

// convertSchemasToBodyPayloads converts every schema a route's output names.
// (Request bodies would add inputTypes.body, which http meta never carries.)
func convertSchemasToBodyPayloads(st *state.State) (*Object, error) {
	required := map[string]bool{}
	for _, method := range st.HTTP.Meta.Keys() {
		routes := st.HTTP.Meta.At(method)
		if routes == nil {
			continue
		}
		for _, route := range routes.Keys() {
			meta := routes.At(route)
			if meta == nil {
				continue
			}
			if fn := st.Functions.Meta.At(meta.PikkuFuncId); fn != nil && len(fn.Outputs) > 0 && fn.Outputs[0] != "" {
				required[fn.Outputs[0]] = true
			}
		}
	}
	out := NewObject()
	for _, key := range st.Schemas.Keys() {
		if !required[key] {
			continue
		}
		schema, err := ParseRaw(st.Schemas.At(key))
		if err != nil {
			return nil, fmt.Errorf("schemas[%s]: %w", key, err)
		}
		converted, err := ConvertSchemaToOpenAPI(schema)
		if err != nil {
			return nil, fmt.Errorf("converting schema '%s' to OpenAPI: %w", key, err)
		}
		out.Set(key, converted)
	}
	return out, nil
}
