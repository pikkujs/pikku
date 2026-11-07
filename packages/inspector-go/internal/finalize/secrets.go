package finalize

import (
	"bytes"
	"encoding/json"
	"path/filepath"
	"slices"
	"strings"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// Ports of the secret steps and computeDiagnostics in utils/post-process.ts.

func validateNoSecretAliasServices(log *diag.Logger, st *state.State) {
	if st.ServiceTypes == nil || len(st.ServiceTypes.SecretAliases) == 0 {
		return
	}
	aliases := st.ServiceTypes.SecretAliases
	report := func(kind, id string, services []string) {
		var used []string
		for _, s := range services {
			if slices.Contains(aliases, s) {
				used = append(used, s)
			}
		}
		if len(used) == 0 {
			return
		}
		verb := "are"
		if len(used) == 1 {
			verb = "is"
		}
		log.Critical(diag.SecretServiceAliased,
			kind+" '"+id+"' receives "+strings.Join(quoteEach(used), ", ")+", which "+verb+" a SecretService under another name. "+
				"SecretService is confined to pikkuServices, pikkuWireServices, addon service factories and middleware — give a service the secret value when you construct it and expose only what the function needs.")
	}
	st.Functions.Meta.Each(func(id string, meta *state.FunctionMeta) {
		if meta != nil {
			report("Function", id, meta.Services.Services)
		}
	})
	permissions := rawRecord(st.Permissions.Definitions)
	permissions.Each(func(id string, r state.Raw) {
		var services []string
		if d := decode[definitionMeta](r); d.Services != nil && d.Services.Services != nil {
			services = *d.Services.Services
		}
		report("Permission", id, services)
	})
}

// credentialOAuth2 is the part of a credential definition's oauth2 block
// deriveOAuth2AppSecrets copies.
type credentialOAuth2 struct {
	AppCredentialSecretId json.RawMessage `json:"appCredentialSecretId"`
	TokenSecretId         json.RawMessage `json:"tokenSecretId"`
	AuthorizationUrl      json.RawMessage `json:"authorizationUrl"`
	TokenUrl              json.RawMessage `json:"tokenUrl"`
	Scopes                json.RawMessage `json:"scopes"`
	ScopeSeparator        json.RawMessage `json:"scopeSeparator"`
	Pkce                  json.RawMessage `json:"pkce"`
	AdditionalParams      json.RawMessage `json:"additionalParams"`
}

// setDefined sets k when v is present: an undefined member disappears from
// the JSON, a null one does not.
func setDefined(o *object, k string, v json.RawMessage) {
	if len(v) > 0 {
		o.Set(k, state.Raw(v))
	}
}

// deriveOAuth2AppSecrets is @pikku/core/secret deriveOAuth2AppSecrets.
func deriveOAuth2AppSecrets(credentials, declared state.List[state.Raw]) []state.Raw {
	covered := map[string]bool{}
	for _, r := range declared {
		covered[string(rawMember(r, "secretId"))] = true
	}
	var derived []state.Raw
	for _, r := range credentials {
		cred := decode[struct {
			Name        json.RawMessage   `json:"name"`
			DisplayName json.RawMessage   `json:"displayName"`
			DocsUrl     json.RawMessage   `json:"docsUrl"`
			SourceFile  json.RawMessage   `json:"sourceFile"`
			OAuth2      *credentialOAuth2 `json:"oauth2"`
		}](r)
		if cred.OAuth2 == nil {
			continue
		}
		o := cred.OAuth2
		key := string(compact(o.AppCredentialSecretId))
		if covered[key] {
			continue
		}
		covered[key] = true

		displayName := templateValue(cred.DisplayName)
		secret := &object{}
		secret.Set("name", encode(templateValue(cred.Name)+"App"))
		secret.Set("displayName", encode(displayName+" OAuth App"))
		secret.Set("description", encode("OAuth2 app client id and secret for "+displayName+"."))
		setDefined(secret, "secretId", o.AppCredentialSecretId)
		secret.Set("optional", state.Raw("true"))
		setDefined(secret, "docsUrl", cred.DocsUrl)
		oauth2 := &object{}
		setDefined(oauth2, "tokenSecretId", o.TokenSecretId)
		setDefined(oauth2, "authorizationUrl", o.AuthorizationUrl)
		setDefined(oauth2, "tokenUrl", o.TokenUrl)
		setDefined(oauth2, "scopes", o.Scopes)
		setDefined(oauth2, "scopeSeparator", o.ScopeSeparator)
		setDefined(oauth2, "pkce", o.Pkce)
		setDefined(oauth2, "additionalParams", o.AdditionalParams)
		secret.Set("oauth2", encode(oauth2))
		setDefined(secret, "sourceFile", cred.SourceFile)
		derived = append(derived, encode(secret))
	}
	return derived
}

// rawMember is one member of a Raw object, compacted so equal values compare
// equal; nil when absent.
func rawMember(r state.Raw, key string) json.RawMessage {
	return compact(decode[map[string]json.RawMessage](r)[key])
}

func compact(r json.RawMessage) json.RawMessage {
	if len(r) == 0 {
		return nil
	}
	var buf bytes.Buffer
	if err := json.Compact(&buf, r); err != nil {
		return r
	}
	return json.RawMessage(buf.Bytes())
}

func registerDerivedOAuth2AppSecrets(st *state.State) {
	derived := deriveOAuth2AppSecrets(st.Credentials.Definitions, st.Secrets.Definitions)
	st.Secrets.Definitions = append(st.Secrets.Definitions, derived...)
}

// jsRelative is node's path.relative for two absolute paths.
func jsRelative(from, to string) string {
	rel, err := filepath.Rel(from, to)
	if err != nil {
		return to
	}
	if rel == "." {
		return ""
	}
	return rel
}

func validateSecretUsage(log *diag.Logger, st *state.State) {
	declared := map[string]bool{}
	for _, r := range st.Secrets.Definitions {
		d := decode[struct {
			SecretId json.RawMessage `json:"secretId"`
			OAuth2   *struct {
				TokenSecretId json.RawMessage `json:"tokenSecretId"`
			} `json:"oauth2"`
		}](r)
		if s, ok := stringValue(d.SecretId); ok {
			declared[s] = true
		}
		if d.OAuth2 != nil && truthy(d.OAuth2.TokenSecretId) {
			declared[templateValue(d.OAuth2.TokenSecretId)] = true
		}
	}
	if authDefinition(st) != nil {
		declared["BETTER_AUTH_SECRET"] = true
	}

	st.Secrets.Usage.Each(func(file string, usage *state.SecretUsage) {
		if usage == nil {
			return
		}
		relativeFile := jsRelative(st.RootDir, file)
		var undeclared []string
		for _, k := range usage.Keys {
			if !declared[k] {
				undeclared = append(undeclared, k)
			}
		}
		if len(undeclared) > 0 {
			log.Diagnostic(diag.Warn, diag.SecretNotDeclared,
				relativeFile+" reads "+strings.Join(quoteEach(undeclared), ", ")+", which no defineSecret declares. Declare it so it is validated at deploy time and shown to whoever has to provision it.")
		}
		if len(usage.Dynamic) > 0 {
			log.Diagnostic(diag.Warn, diag.SecretKeyNotStatic,
				relativeFile+" reads a secret with a non-literal key ("+strings.Join(usage.Dynamic, ", ")+"). The deployment cannot narrow its secret scope around a key it cannot see.")
		}
	})
}

func computeDiagnostics(st *state.State) {
	out := state.List[state.InspectorDiagnostic]{}
	add := func(code diag.Code, msg, sourceFile string, position int) {
		out = append(out, state.InspectorDiagnostic{Code: string(code), Message: msg, SourceFile: sourceFile, Position: position})
	}

	st.Functions.Meta.Each(func(id string, meta *state.FunctionMeta) {
		if meta == nil || meta.SourceFile == "" || strings.HasSuffix(meta.SourceFile, ".gen.ts") ||
			meta.FunctionType == "inline" || meta.FunctionType == "helper" {
			return
		}
		if !meta.Services.Optimized {
			add(diag.ServicesNotDestructured, "Function '"+id+"' does not destructure its services parameter, preventing tree-shaking optimization.", meta.PikkuFuncId, 0)
		}
		if meta.Wires != nil && !meta.Wires.Optimized {
			add(diag.WiresNotDestructured, "Function '"+id+"' does not destructure its wires parameter, preventing tree-shaking optimization.", meta.PikkuFuncId, 0)
		}
		if st.Functions.DynamicImportIds.Has(id) {
			add(diag.FunctionDynamicImport, "Function '"+id+"' performs a runtime dynamic 'import(...)' in its body. Move the import to the top of the module (static import) or into your services/wireServices setup — function bodies run on every invocation, so a dynamic import there adds latency and defeats bundling/tree-shaking.", meta.PikkuFuncId, 0)
		}
	})

	definitions := func(kind string, defs state.Record[state.Raw]) {
		defs.Each(func(id string, r state.Raw) {
			d := decode[definitionMeta](r)
			if d.Services != nil && !d.Services.Optimized {
				add(diag.ServicesNotDestructured, kind+" '"+id+"' does not destructure its services parameter, preventing tree-shaking optimization.", d.SourceFile, d.Position)
			}
			if d.Wires != nil && !d.Wires.Optimized {
				add(diag.WiresNotDestructured, kind+" '"+id+"' does not destructure its wires parameter, preventing tree-shaking optimization.", d.SourceFile, d.Position)
			}
		})
	}
	definitions("Middleware", rawRecord(st.Middleware.Definitions))
	definitions("Permission", rawRecord(st.Permissions.Definitions))

	st.Diagnostics = out
}
