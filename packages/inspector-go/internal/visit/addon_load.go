package visit

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/remotesdk"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// Port of utils/load-addon-functions-meta.ts.

var webhookSourceSteps = []string{"receive", "check", "setup", "teardown"}

// resolveAddonMeta resolves an addon's generated metadata, preferring the
// verbose copy.
func resolveAddonMeta(req addonResolver, pkg, baseName string) string {
	for _, suffix := range []string{"-verbose.gen.json", ".gen.json"} {
		if p, err := req.resolve(pkg + "/.pikku/" + baseName + suffix); err == nil {
			return p
		}
	}
	return ""
}

func describeMissingAddonMeta(namespace, pkg string, dirs []string, declFile string) string {
	declaredIn := ""
	if declFile != "" {
		caller, err := filepath.Rel(dirs[len(dirs)-1], declFile)
		if err != nil || caller == "" || caller == "." {
			caller = declFile
		}
		declaredIn = " (declared in " + caller + ")"
	}
	packageDir := findInstalledPackageDir(dirs, pkg)
	if packageDir == "" {
		return fmt.Sprintf("wireAddon('%s')%s names %s, which is not installed where it can be resolved — tried %s. "+
			"Add \"%s\": \"workspace:*\" (or a version) to the dependencies of %s and run install.",
			namespace, declaredIn, pkg, strings.Join(dirs, ", "), pkg, filepath.Join(dirs[0], "package.json"))
	}
	return fmt.Sprintf("wireAddon('%s')%s: %s is installed at %s but has not been built — "+
		"its dist/.pikku/addon/function/pikku-functions-meta.gen.json does not exist. Run the addon's build (pikku all && tsc && pikku dist) in %s.",
		namespace, declaredIn, pkg, packageDir, packageDir)
}

func readJSONFile(path string) (*ojson, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return parseOJSON(raw)
}

// readResolvedJSON is `JSON.parse(await readFile(require.resolve(id)))`.
func readResolvedJSON(req addonResolver, id string) (*ojson, error) {
	p, err := req.resolve(id)
	if err != nil {
		return nil, err
	}
	return readJSONFile(p)
}

// readAddonContributors is the platform service contributors an addon declares
// in its package.json under pikku.contributors, as { packageName, packageDir,
// contributors }, or nil when it declares none.
func readAddonContributors(dirs []string, pkg string) (*ojson, error) {
	dir := findInstalledPackageDir(dirs, pkg)
	if dir == "" {
		return nil, nil
	}
	pj, err := readJSONFile(filepath.Join(dir, "package.json"))
	if err != nil {
		return nil, nil
	}
	pikku := pj.get("pikku")
	if !pikku.has("contributors") {
		return nil, nil
	}
	declared := pikku.get("contributors")
	malformed := fmt.Errorf("%s declares pikku.contributors in its package.json, but it is not a list of { module, export? }.", pkg)
	if declared == nil || !declared.isArr {
		return nil, malformed
	}
	refs := &ojson{isArr: true, arr: []*ojson{}}
	for _, entry := range declared.arr {
		module, ok := entry.get("module").str()
		if !entry.isObject() || !ok {
			return nil, malformed
		}
		ref := newOObject()
		ref.set("module", ojsonString(module))
		if entry.has("export") {
			name, ok := entry.get("export").str()
			if !ok {
				return nil, malformed
			}
			ref.set("export", ojsonString(name))
		}
		refs.arr = append(refs.arr, ref)
	}
	if len(refs.arr) == 0 {
		return nil, nil
	}
	out := newOObject()
	out.set("packageName", ojsonString(pkg))
	out.set("packageDir", ojsonString(dir))
	out.set("contributors", refs)
	return out, nil
}

func (s *Context) recordAddonContributors(ns string, contributors *ojson) {
	all := newOObject()
	if len(s.State.AddonContributors) > 0 && string(s.State.AddonContributors) != "null" {
		if existing, err := parseOJSON(s.State.AddonContributors); err == nil && existing.isObject() {
			all = existing
		}
	}
	all.set(ns, contributors)
	s.State.AddonContributors = all.raw()
}

// namespaceAddonWebhookSources names an addon's webhook sources after the
// namespace it is wired under.
func namespaceAddonWebhookSources(sources *ojson, namespace string) *state.Record[*ojson] {
	declared := sources.values()
	out := state.NewRecord[*ojson]()
	for _, source := range declared {
		if !source.isObject() {
			continue
		}
		name := namespace
		if len(declared) != 1 {
			n, _ := source.get("name").str()
			name = namespace + "-" + n
		}
		meta := source.clone()
		meta.set("name", ojsonString(name))
		meta.set("route", ojsonString("/webhooks/"+name))
		for _, step := range webhookSourceSteps {
			if id, ok := source.get(step).str(); ok && id != "" && !strings.Contains(id, ":") {
				meta.set(step, ojsonString(namespace+":"+id))
			}
		}
		out.Set(name, meta)
	}
	return out
}

var errContractShape = errors.New("contract metadata has an unexpected shape")

func isHTTPRouteConfig(v *ojson) bool {
	return v.isJSObject() && v.has("method") && v.has("func") && v.has("route")
}

func isHTTPRouteGroup(v *ojson) bool {
	return v.isJSObject() && v.has("routes") && !v.has("method")
}

func applyPackageToHTTPRouteMap(routes *ojson, pkg, namespace string) error {
	for _, value := range routes.values() {
		if !value.isJSObject() {
			continue
		}
		switch {
		case isHTTPRouteConfig(value):
			fn := value.get("func")
			if !fn.isJSObject() {
				return errContractShape
			}
			if !fn.get("packageName").truthy() {
				fn.set("packageName", ojsonString(pkg))
			}
			if namespace != "" {
				id, ok := fn.get("pikkuFuncId").str()
				if !ok {
					return errContractShape
				}
				if !strings.Contains(id, ":") {
					fn.set("pikkuFuncId", ojsonString(namespace+":"+id))
				}
			}
		case isHTTPRouteGroup(value):
			if err := applyPackageToHTTPRouteMap(value.get("routes"), pkg, namespace); err != nil {
				return err
			}
		default:
			if err := applyPackageToHTTPRouteMap(value, pkg, namespace); err != nil {
				return err
			}
		}
	}
	return nil
}

func applyPackageToHTTPContracts(contracts *ojson, pkg, namespace string) error {
	for _, contract := range contracts.values() {
		if contract == nil || (!contract.isJSObject() && contract.scalar == nil) {
			return errContractShape
		}
		if err := applyPackageToHTTPRouteMap(contract.get("routes"), pkg, namespace); err != nil {
			return err
		}
	}
	return nil
}

func applyPackageToCLICommands(commands *ojson, pkg, namespace string) {
	for _, command := range commands.values() {
		if !command.isJSObject() {
			continue
		}
		if !command.get("packageName").truthy() && command.get("pikkuFuncId").truthy() {
			command.set("packageName", ojsonString(pkg))
		}
		if id, ok := command.get("pikkuFuncId").str(); ok && namespace != "" && id != "" && !strings.Contains(id, ":") {
			command.set("pikkuFuncId", ojsonString(namespace+":"+id))
		}
		if sub := command.get("subcommands"); sub.truthy() {
			applyPackageToCLICommands(sub, pkg, namespace)
		}
	}
}

func applyPackageToCLIContracts(contracts *ojson, pkg, namespace string) error {
	for _, commands := range contracts.values() {
		if commands == nil || (!commands.isJSObject() && commands.scalar == nil) {
			return errContractShape
		}
		applyPackageToCLICommands(commands, pkg, namespace)
	}
	return nil
}

func applyPackageToChannelContracts(contracts *ojson, pkg, namespace string) error {
	for _, routes := range contracts.values() {
		if routes == nil || (!routes.isJSObject() && routes.scalar == nil) {
			return errContractShape
		}
		for _, route := range routes.values() {
			if !route.isJSObject() {
				return errContractShape
			}
			if !route.get("packageName").truthy() {
				route.set("packageName", ojsonString(pkg))
			}
			id, ok := route.get("pikkuFuncId").str()
			if !ok {
				return errContractShape
			}
			if !strings.Contains(id, ":") {
				route.set("pikkuFuncId", ojsonString(namespace+":"+id))
			}
		}
	}
	return nil
}

var requiredParentServicesRe = regexp.MustCompile(`(?m)^export const requiredParentServices\s*=\s*(\[[^\]]*\])`)

// readRequiredParentServices reads `export const requiredParentServices = [...]`
// from an addon's generated pikku-services.gen.js, which the TS imports.
func readRequiredParentServices(path string) ([]string, bool) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, false
	}
	m := requiredParentServicesRe.FindSubmatch(raw)
	if m == nil {
		return nil, false
	}
	var out []string
	if json.Unmarshal(m[1], &out) != nil {
		return nil, false
	}
	return out, true
}

// LoadAddonFunctionsMeta is loadAddonFunctionsMeta: after the setup sweep,
// read each wired addon's generated metadata so the routes sweep can resolve
// addon functions.
func (s *Context) LoadAddonFunctionsMeta() {
	for _, ns := range s.addonOrder {
		decl := s.addons[ns]
		if decl.remote {
			if decl.rng != "" {
				s.loadRemoteAddonSdkMeta(ns, decl)
			}
			continue
		}
		if err := s.loadAddon(ns, decl); err != nil {
			s.Log.Warn(fmt.Sprintf("Failed to load addon function metadata for '%s' (%s): %s", ns, decl.pkg, err.Error()))
		}
	}
}

// loadRemoteAddonSdkMeta is loadRemoteAddonSdkMeta: a versioned remote
// addon's function metadata, read from its SDK only when it matches the lock.
func (s *Context) loadRemoteAddonSdkMeta(ns string, decl *addonDecl) {
	lock, err := remotesdk.ReadLock(s.RootDir)
	if err != nil {
		return
	}
	dir, reason := remotesdk.Check(s.RootDir, decl.pkg, decl.rng, lock)
	if reason != "" {
		return
	}
	meta, err := readJSONFile(filepath.Join(dir, "function", "pikku-functions-meta.gen.json"))
	if err != nil {
		return
	}
	fns := state.NewRecord[*FunctionMeta]()
	if meta.isObject() {
		meta.obj.Each(func(name string, entry *ojson) {
			m := &FunctionMeta{}
			raw := entry.raw()
			_ = json.Unmarshal(raw, m)
			m.Verbatim = raw
			fns.Set(name, m)
		})
	}
	if s.State.RemoteAddonFunctions == nil {
		s.State.RemoteAddonFunctions = state.NewRecord[*state.Record[*FunctionMeta]]()
	}
	s.State.RemoteAddonFunctions.Set(ns, fns)
}

func (s *Context) loadAddon(ns string, decl *addonDecl) error {
	dirs := addonResolutionDirs(s.RootDir, decl.file)
	req := addonResolver(dirs)

	if contributors, err := readAddonContributors(dirs, decl.pkg); err != nil {
		s.Log.Error(fmt.Sprintf("wireAddon('%s'): %s", ns, err.Error()))
	} else if contributors != nil {
		s.recordAddonContributors(ns, contributors)
	}

	s.recordDeclaredUses(ns, decl, dirs)

	if decl.ui {
		if err := s.loadAddonStudio(ns, decl, req); err != nil {
			return err
		}
	}

	metaPath := resolveAddonMeta(req, decl.pkg, "function/pikku-functions-meta")
	if metaPath == "" {
		s.Log.Warn(describeMissingAddonMeta(ns, decl.pkg, dirs, decl.file))
		return nil
	}
	meta, err := readJSONFile(metaPath)
	if err != nil {
		return err
	}
	fns := state.NewRecord[*FunctionMeta]()
	if meta.isObject() {
		meta.obj.Each(func(name string, entry *ojson) {
			m := &FunctionMeta{}
			raw := entry.raw()
			_ = json.Unmarshal(raw, m)
			m.Verbatim = raw
			fns.Set(name, m)
		})
	}
	s.State.AddonFunctions.Set(ns, fns)
	s.Log.Debugf("Loaded %d addon functions for '%s' from %s", fns.Len(), ns, decl.pkg)
	s.registerAddonTypes(metaPath, fns)

	s.loadAddonMCPTools(ns, decl, meta)
	if names, ok := decl.expose.([]string); ok {
		for _, fn := range names {
			if !meta.has(fn) {
				s.Log.Critical(diag.AddonExposeFunctionNotFound, fmt.Sprintf(
					"wireAddon('%s') lists '%s' under expose, but %s publishes no such function.", ns, fn, decl.pkg))
			} else if m := fns.At(fn); m == nil || m.Expose == nil || !*m.Expose {
				s.Log.Critical(diag.AddonExposeFunctionNotFound, fmt.Sprintf(
					"wireAddon('%s') lists '%s' under expose, but %s does not declare it expose: true, so it stays unexposed.", ns, fn, decl.pkg))
			}
		}
	}

	s.loadAddonSecrets(decl, req)
	// Scopes: governance's loadAddonScopes (scope_addon.go), given the
	// directory the scopes meta resolves from.
	for _, dir := range req {
		if resolvePackageSubpath(dir, decl.pkg, ".pikku/scopes/pikku-scopes-meta.gen.json") != "" {
			s.loadAddonScopes(decl, dir)
			break
		}
	}
	s.loadAddonVariables(decl, req)
	s.loadAddonCredentials(decl, req)
	s.loadAddonServices(ns, decl, req)
	s.loadAddonWebhookSources(ns, decl, req)
	s.loadAddonContracts(ns, decl, req)
	return nil
}

func (s *Context) loadAddonStudio(ns string, decl *addonDecl, req addonResolver) error {
	var manifest *ojson
	if path := resolveAddonMeta(req, decl.pkg, "screens/pikku-screens-meta"); path != "" {
		m, err := readJSONFile(path)
		if err != nil {
			s.Log.Critical(diag.AddonUiHasNoScreens, fmt.Sprintf(
				"wireAddon('%s') sets ui: true, but the screens manifest of %s could not be read: %s", ns, decl.pkg, err.Error()))
			return nil
		}
		manifest = m
	}
	if manifest != nil && manifest.scalar == nil && !manifest.isJSObject() {
		manifest = nil
	}
	if manifest != nil {
		screens := manifest.get("screens")
		if screens == nil || (!screens.isJSObject() && (screens.scalar == nil)) {
			return errors.New("Cannot read properties of undefined (reading 'length')")
		}
	}
	if manifest == nil || len(manifest.get("screens").arr) == 0 {
		s.Log.Critical(diag.AddonUiHasNoScreens, fmt.Sprintf(
			"wireAddon('%s') sets ui: true, but %s declares no screens. Add a definePlugin call to the package, or drop ui.", ns, decl.pkg))
		return nil
	}
	seen := map[string]bool{}
	scopes := []string{}
	for _, sc := range append(manifest.get("scopes").strings(), decl.scopes...) {
		if !seen[sc] {
			seen[sc] = true
			scopes = append(scopes, sc)
		}
	}
	sort.Strings(scopes)
	entry := manifest.clone()
	arr := &ojson{isArr: true, arr: []*ojson{}}
	for _, sc := range scopes {
		arr.arr = append(arr.arr, ojsonString(sc))
	}
	entry.set("scopes", arr)

	all := newOObject()
	if len(s.State.AddonStudio) > 0 && string(s.State.AddonStudio) != "null" {
		if existing, err := parseOJSON(s.State.AddonStudio); err == nil && existing.isObject() {
			all = existing
		}
	}
	all.set(ns, entry)
	s.State.AddonStudio = all.raw()
	return nil
}

// registerAddonTypes gives the addon's input/output type names the addon's
// published declaration file to be imported from.
func (s *Context) registerAddonTypes(metaPath string, fns *state.Record[*FunctionMeta]) {
	typesPath := filepath.ToSlash(filepath.Join(filepath.Dir(metaPath), "..", "rpc", "pikku-rpc-wirings-map.internal.gen.d.ts"))
	if _, err := os.Stat(typesPath); err != nil {
		return
	}
	fns.Each(func(_ string, m *FunctionMeta) {
		for _, n := range []*string{m.InputSchemaName, m.OutputSchemaName} {
			if n != nil && *n != "" && s.TypesMap().Exists(*n, typesPath) == "" {
				s.TypesMap().AddType(*n, typesPath)
			}
		}
	})
}

func (s *Context) loadAddonMCPTools(ns string, decl *addonDecl, meta *ojson) {
	if decl.mcp == nil || decl.mcp == false {
		return
	}
	selected, isList := decl.mcp.([]string)
	inSelected := map[string]bool{}
	for _, n := range selected {
		inSelected[n] = true
	}
	surface := ""
	switch ep := decl.mcpEndpoint.(type) {
	case string:
		if ep != "" {
			surface = ns
			s.State.MCPEndpoints.Surfaces.Set(ns, ep)
		}
	case bool:
		if ep {
			surface = ns
			s.State.MCPEndpoints.Surfaces.Set(ns, "/mcp/"+ns)
		}
	}
	if meta.isObject() {
		meta.obj.Each(func(fn string, fm *ojson) {
			if isList && !inSelected[fn] || !isList && !fm.get("mcp").truthy() {
				return
			}
			toolName := ns + ":" + fn
			description := ojsonString(fn)
			if d := fm.get("description"); d.truthy() {
				description = d
			} else if t := fm.get("title"); t.truthy() {
				description = t
			}
			nullish := func(v *ojson) *ojson {
				if v == nil {
					return &ojson{}
				}
				return v
			}
			o := newOObject()
			o.set("pikkuFuncId", ojsonString(toolName))
			o.set("name", ojsonString(toolName))
			o.set("description", description)
			o.set("inputSchema", nullish(fm.get("inputSchemaName")))
			o.set("outputSchema", nullish(fm.get("outputSchemaName")))
			if fm.has("tags") {
				o.set("tags", fm.get("tags"))
			}
			if surface != "" {
				o.set("surface", ojsonString(surface))
			}
			// The addon's meta is JSON; a field of the wrong type would be a
			// broken package, so the tool is decoded rather than built field
			// by field.
			tool := &state.MCPToolMeta{}
			if err := json.Unmarshal(o.raw(), tool); err != nil {
				s.Log.Debugf("Skipping MCP tool %s: %s", toolName, err.Error())
				return
			}
			tool.FromAddon = true
			s.State.MCPEndpoints.ToolsMeta.Set(toolName, tool)
		})
	}
	for _, fn := range selected {
		if !meta.has(fn) {
			s.Log.Critical(diag.AddonMcpFunctionNotFound, fmt.Sprintf(
				"wireAddon('%s') lists '%s' under mcp, but %s publishes no such function.", ns, fn, decl.pkg))
		}
	}
}

// definitionsOf parses a definitions list for the find() the merges do.
func definitionsOf(defs state.List[state.Raw]) []*ojson {
	out := make([]*ojson, 0, len(defs))
	for _, d := range defs {
		v, err := parseOJSON(d)
		if err != nil {
			v = nil
		}
		out = append(out, v)
	}
	return out
}

// nullishOr is `v ?? fallback`.
func nullishOr(v, fallback *ojson) *ojson {
	if v == nil || (!v.isJSObject() && v.scalar == nil) {
		return fallback
	}
	return v
}

func sameString(a, b *ojson) bool {
	x, ok1 := a.str()
	y, ok2 := b.str()
	return ok1 && ok2 && x == y
}

// mergeAddonDefinitions is the shared shape of the secrets / variables /
// credentials merges: resolve each entry's id through the instance's
// overrides, and add it unless the project already defines that id.
func (s *Context) mergeAddonDefinitions(req addonResolver, id string, defs *state.List[state.Raw], overrides *state.Record[*ojson], idField, kind, pkg string) {
	meta, err := readResolvedJSON(req, id)
	if err != nil || !meta.isObject() {
		return
	}
	meta.obj.Each(func(key string, def *ojson) {
		logical := ojsonString(key)
		if idField != "name" {
			logical = nullishOr(def.get(idField), logical)
		}
		resolved := logical
		if overrides != nil {
			if ls, ok := logical.str(); ok {
				if o, ok := overrides.Get(ls); ok {
					resolved = nullishOr(o, logical)
				}
			}
		}
		for _, d := range definitionsOf(*defs) {
			have := d.get("name")
			if idField != "name" {
				have = nullishOr(d.get(idField), have)
			}
			if sameString(have, resolved) {
				return
			}
		}
		entry := def.clone()
		if !entry.isObject() {
			entry = newOObject()
		}
		entry.set(idField, resolved)
		*defs = append(*defs, entry.raw())
		rs, _ := resolved.str()
		s.Log.Debugf("Loaded addon %s '%s' from %s", kind, rs, pkg)
	})
}

func (s *Context) loadAddonSecrets(decl *addonDecl, req addonResolver) {
	s.mergeAddonDefinitions(req, decl.pkg+"/.pikku/secrets/pikku-secrets-meta.gen.json",
		&s.State.Secrets.Definitions, decl.overrides["secret"], "secretId", "secret", decl.pkg)
}

func (s *Context) loadAddonVariables(decl *addonDecl, req addonResolver) {
	s.mergeAddonDefinitions(req, decl.pkg+"/.pikku/variables/pikku-variables-meta.gen.json",
		&s.State.Variables.Definitions, decl.overrides["variable"], "variableId", "variable", decl.pkg)
}

func (s *Context) loadAddonCredentials(decl *addonDecl, req addonResolver) {
	s.mergeAddonDefinitions(req, decl.pkg+"/.pikku/credentials/pikku-credentials-meta.gen.json",
		&s.State.Credentials.Definitions, decl.overrides["credential"], "name", "credential", decl.pkg)
}

// loadAddonServices reads serverlessIncompatible and requiredParentServices
// from the addon meta, falling back to the generated services module.
func (s *Context) loadAddonServices(ns string, decl *addonDecl, req addonResolver) {
	loadedParent := false
	if meta, err := readResolvedJSON(req, decl.pkg+"/.pikku/console/pikku-addon-meta.gen.json"); err == nil {
		if si := meta.get("serverlessIncompatible"); si != nil && si.isArr && len(si.arr) > 0 {
			s.State.AddonServerlessIncompatible.Set(ns, si.strings())
		}
		if rp := meta.get("requiredParentServices"); rp != nil && rp.isArr && len(rp.arr) > 0 {
			s.State.AddonRequiredParentServices = append(s.State.AddonRequiredParentServices, rp.strings()...)
			loadedParent = true
		}
	}
	if loadedParent {
		return
	}
	path, err := req.resolve(decl.pkg + "/.pikku/pikku-services.gen.js")
	if err != nil {
		return
	}
	if services, ok := readRequiredParentServices(path); ok {
		s.State.AddonRequiredParentServices = append(s.State.AddonRequiredParentServices, services...)
	}
}

func (s *Context) loadAddonWebhookSources(ns string, decl *addonDecl, req addonResolver) {
	raw, err := readResolvedJSON(req, decl.pkg+"/.pikku/webhooks/pikku-webhook-sources-meta.gen.json")
	if err != nil {
		return
	}
	sources := namespaceAddonWebhookSources(raw, ns)
	sources.Each(func(name string, source *ojson) {
		if existing, ok := s.State.Triggers.WebhookSourceMeta.Get(name); ok && len(existing) > 0 && string(existing) != "null" {
			return
		}
		s.State.Triggers.WebhookSourceMeta.Set(name, source.raw())
		for _, step := range webhookSourceSteps {
			if id, ok := source.get(step).str(); ok && id != "" {
				s.State.ServiceAggregation.UsedFunctions.Add(id)
			}
		}
	})
}

func (s *Context) loadAddonContracts(ns string, decl *addonDecl, req addonResolver) {
	ec := &s.State.ExportedContracts
	if c, err := readResolvedJSON(req, decl.pkg+"/.pikku/http/pikku-http-contracts-meta.gen.json"); err == nil {
		if applyPackageToHTTPContracts(c, decl.pkg, ns) == nil {
			ec.AddonHTTP.Set(ns, c.raw())
		}
	}
	if c, err := readResolvedJSON(req, decl.pkg+"/.pikku/cli/pikku-cli-contracts-meta.gen.json"); err == nil {
		if applyPackageToCLIContracts(c, decl.pkg, ns) == nil {
			ec.AddonCLI.Set(ns, c.raw())
		}
	}
	if c, err := readResolvedJSON(req, decl.pkg+"/.pikku/channel/pikku-channel-contracts-meta.gen.json"); err == nil {
		if applyPackageToChannelContracts(c, decl.pkg, ns) == nil {
			ec.AddonChannel.Set(ns, c.raw())
		}
	}
}

// ResolveAddonFile is require.resolve(id) the way loadAddonSchemas does it
// for an addon declared in declFile: from the declaring package, then the
// root. It returns "" when nothing resolves.
func ResolveAddonFile(rootDir, declFile, id string) string {
	p, err := addonResolver(addonResolutionDirs(rootDir, declFile)).resolve(id)
	if err != nil {
		return ""
	}
	return p
}

func isFalsyJSON(raw state.Raw) bool {
	v, err := parseOJSON(raw)
	return err != nil || !v.truthy()
}
