package finalize

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/remotesdk"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// Ports of the wireAddon validators in utils/post-process.ts.

// definitionIds is `new Set(definitions.map((d) => d[key] ?? d.name))` over a
// Raw definitions list, in insertion order.
func definitionIds(defs state.List[state.Raw], key string) *orderedSet {
	ids := &orderedSet{}
	for _, r := range defs {
		d := decode[map[string]json.RawMessage](r)
		v, ok := d[key]
		if key == "" || !ok || strings.TrimSpace(string(v)) == "null" {
			v = d["name"]
		}
		ids.add(templateValue(v))
	}
	return ids
}

func validateSecretOverrides(log *diag.Logger, st *state.State) {
	decls := addonDecls(st)
	if len(decls) == 0 {
		return
	}
	secretIds := definitionIds(st.Secrets.Definitions, "secretId")
	// auth-secrets.gen.ts declares it, but that file is written after the first
	// inspection of a fresh project, so its defineSecret is not seen yet — the
	// same fallback validateSecretUsage takes.
	if authDefinition(st) != nil {
		secretIds.add("BETTER_AUTH_SECRET")
	}
	for _, e := range decls {
		if e.decl.SecretOverrides != nil {
			e.decl.SecretOverrides.Each(func(logical string, resolved json.RawMessage) {
				if !secretIds.has(templateValue(resolved)) {
					log.Critical(diag.InvalidValue, "Secret override '"+logical+"' -> '"+templateValue(resolved)+"' in addon '"+e.namespace+"' ("+jsString(e.decl.Package)+") targets a secret that does not exist. Available secrets: "+orNone(secretIds.items))
				}
			})
		}
		for _, logical := range e.decl.SecretGrants {
			resolved := logical
			if e.decl.SecretOverrides != nil {
				if v, ok := e.decl.SecretOverrides.Get(logical); ok && strings.TrimSpace(string(v)) != "null" {
					resolved = templateValue(v)
				}
			}
			if !secretIds.has(resolved) {
				log.Critical(diag.InvalidValue, "Secret grant '"+logical+"' in addon '"+e.namespace+"' ("+jsString(e.decl.Package)+") targets a secret that does not exist. Available secrets: "+orNone(secretIds.items))
			}
		}
	}
}

func validateAddonUses(log *diag.Logger, st *state.State) {
	decls := addonDecls(st)
	if len(decls) == 0 {
		return
	}
	for _, e := range decls {
		if e.decl.Uses == nil {
			continue
		}
		e.decl.Uses.Each(func(name string, targetRaw json.RawMessage) {
			target := templateValue(targetRaw)
			if e.decl.DeclaredUses != nil && !slices.Contains(*e.decl.DeclaredUses, name) {
				declared := "nothing"
				if len(*e.decl.DeclaredUses) > 0 {
					declared = strings.Join(*e.decl.DeclaredUses, ", ")
				}
				log.Critical(diag.AddonUsesNotDeclared, "Addon '"+e.namespace+"' maps '"+name+"' to '"+target+"', but "+jsString(e.decl.Package)+" does not declare '"+name+"' in the pikku.uses of its package.json. It declares: "+declared+". Remove '"+name+"' from uses, or have the addon declare it.")
				return
			}
			expected := name
			for _, d := range e.decl.Dependencies {
				if d.Alias == name {
					expected = d.Package
					break
				}
			}
			wiredRaw, ok := st.RPC.WireAddonDeclarations.Get(target)
			if !ok || !truthy(json.RawMessage(wiredRaw)) {
				log.Critical(diag.AddonUsesNotWired, "Addon '"+e.namespace+"' uses '"+name+"' as '"+target+"', but no addon is wired under the name '"+target+"'. Wired: "+strings.Join(st.RPC.WireAddonDeclarations.Keys(), ", "))
				return
			}
			wired := decode[addonDecl](wiredRaw)
			if wired.Package == nil || *wired.Package != expected {
				if expected == name {
					log.Critical(diag.AddonUsesNotWired, "Addon '"+e.namespace+"' uses '"+name+"' as '"+target+"', but '"+target+"' is wired from '"+jsString(wired.Package)+"'.")
				} else {
					log.Critical(diag.AddonUsesNotWired, "Addon '"+e.namespace+"' calls "+expected+" as '"+name+"', mapped to '"+target+"', but '"+target+"' is wired from '"+jsString(wired.Package)+"'.")
				}
			}
		})
	}
}

func validateAddonContentGrants(log *diag.Logger, st *state.State) {
	decls := addonDecls(st)
	if len(decls) == 0 {
		return
	}
	buckets := &orderedSet{}
	for _, e := range decls {
		if e.decl.ContentBucket != nil {
			buckets.add(*e.decl.ContentBucket)
		} else {
			buckets.add(e.namespace)
		}
	}
	for _, e := range decls {
		if e.decl.ContentGrants == nil {
			continue
		}
		e.decl.ContentGrants.Each(func(prefix string, modeRaw json.RawMessage) {
			mode, isString := stringValue(modeRaw)
			if !isString || (mode != "read" && mode != "write") {
				log.Critical(diag.AddonContentGrantInvalid, "Addon '"+e.namespace+"' grants '"+prefix+"' as '"+templateValue(modeRaw)+"', but a content grant must be 'read' or 'write'.")
			}
			first := ""
			for _, segment := range strings.Split(prefix, "/") {
				if segment != "" {
					first = segment
					break
				}
			}
			if first == "" || !buckets.has(first) {
				log.Critical(diag.AddonContentGrantInvalid, "Addon '"+e.namespace+"' grants content under '"+prefix+"', but '"+first+"' is not the content bucket of any wired addon. Buckets: "+strings.Join(buckets.items, ", "))
			}
		})
	}
}

// credentialOverride is CredentialOverrideMeta: a rename string, or
// { name?, mode? }.
type credentialOverride struct {
	rename *string
	mode   string
}

func parseCredentialOverride(r json.RawMessage) credentialOverride {
	if s, ok := stringValue(r); ok {
		return credentialOverride{rename: &s}
	}
	o := decode[struct {
		Name json.RawMessage `json:"name"`
		Mode json.RawMessage `json:"mode"`
	}](state.Raw(r))
	var out credentialOverride
	if t := strings.TrimSpace(string(o.Name)); t != "" && t != "null" {
		n := templateValue(o.Name)
		out.rename = &n
	}
	if truthy(o.Mode) {
		out.mode = templateValue(o.Mode)
	}
	return out
}

func validateCredentialOverrides(log *diag.Logger, st *state.State) {
	decls := addonDecls(st)
	if len(decls) == 0 {
		return
	}
	credentialNames := definitionIds(st.Credentials.Definitions, "")

	type claim struct{ mode, namespace, logicalName string }
	claims := map[string]claim{}

	for _, e := range decls {
		if e.decl.CredentialOverrides != nil {
			e.decl.CredentialOverrides.Each(func(logical string, r json.RawMessage) {
				override := parseCredentialOverride(r)
				resolved := logical
				if override.rename != nil {
					resolved = *override.rename
				}
				if !credentialNames.has(resolved) {
					target := "'" + logical + "'"
					if override.rename != nil && *override.rename != "" {
						target = "'" + logical + "' -> '" + resolved + "'"
					}
					log.Critical(diag.InvalidValue, "Credential override "+target+" in addon '"+e.namespace+"' ("+jsString(e.decl.Package)+") targets a credential that does not exist. Available credentials: "+orNone(credentialNames.items))
				}
				if override.mode == "" {
					return
				}
				if c, ok := claims[resolved]; ok && c.mode != override.mode {
					log.Critical(diag.InvalidValue, "Credential '"+resolved+"' is wired '"+c.mode+"' by '"+c.logicalName+"' in addon '"+c.namespace+"' and '"+override.mode+"' by '"+logical+"' in addon '"+e.namespace+"'. One credential holds one mode, so the second wiring would silently take the first's resolution. Give them separate names, or wire both the same way.")
				}
				claims[resolved] = claim{override.mode, e.namespace, logical}
			})
		}
		for _, logical := range e.decl.CredentialGrants {
			resolved := logical
			if e.decl.CredentialOverrides != nil {
				if r, ok := e.decl.CredentialOverrides.Get(logical); ok && truthy(r) {
					if o := parseCredentialOverride(r); o.rename != nil {
						resolved = *o.rename
					}
				}
			}
			if !credentialNames.has(resolved) {
				log.Critical(diag.InvalidValue, "Credential grant '"+logical+"' in addon '"+e.namespace+"' ("+jsString(e.decl.Package)+") targets a credential that does not exist. Available credentials: "+orNone(credentialNames.items))
			}
		}
	}
}

func validateVariableOverrides(log *diag.Logger, st *state.State) {
	decls := addonDecls(st)
	if len(decls) == 0 {
		return
	}
	variableIds := definitionIds(st.Variables.Definitions, "variableId")
	for _, e := range decls {
		if e.decl.VariableOverrides == nil {
			continue
		}
		e.decl.VariableOverrides.Each(func(logical string, r json.RawMessage) {
			resolved := templateValue(r)
			if !variableIds.has(resolved) {
				log.Critical(diag.InvalidValue, "Variable override '"+logical+"' -> '"+resolved+"' in addon '"+e.namespace+"' ("+jsString(e.decl.Package)+") targets a variable that does not exist. Available variables: "+orNone(variableIds.items))
			}
		})
	}
}

// nearestPackageDir is addon-resolution.ts nearestPackageDir.
func nearestPackageDir(file string) string {
	root := filepath.VolumeName(file) + string(filepath.Separator)
	dir := filepath.Dir(file)
	for dir != "" && dir != root {
		if fileExists(filepath.Join(dir, "package.json")) {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return ""
}

// addonResolutionDirs is addon-resolution.ts addonResolutionDirs.
func addonResolutionDirs(rootDir string, declFile *string) []string {
	root, _ := filepath.Abs(rootDir)
	declDir := ""
	if declFile != nil && *declFile != "" {
		abs, _ := filepath.Abs(*declFile)
		declDir = nearestPackageDir(abs)
	}
	if declDir != "" && declDir != root {
		return []string{declDir, root}
	}
	return []string{root}
}

func fileExists(p string) bool {
	info, err := os.Stat(p)
	return err == nil && !info.IsDir()
}

func dirExists(p string) bool {
	info, err := os.Stat(p)
	return err == nil && info.IsDir()
}

// isPackageResolvable answers what post-process.ts asks Node's CommonJS
// resolver (`createRequire(dir/package.json).resolve(pkg + '/package.json')`,
// then `.resolve(pkg)`): found unless every attempt is a module-not-found. A
// restrictive exports map refusing the subpath still means the package was
// found, so finding the package directory is enough; the package's own name
// resolves by self-reference when its package.json has "exports".
func isPackageResolvable(pkg string, dirs []string) bool {
	for _, dir := range dirs {
		if selfReferences(dir, pkg) {
			return true
		}
		for _, modules := range nodeModulesPaths(dir) {
			base := filepath.Join(modules, filepath.FromSlash(pkg))
			if fileExists(filepath.Join(base, "package.json")) {
				return true
			}
			for _, ext := range []string{"", ".js", ".json", ".node"} {
				if fileExists(base + ext) {
					return true
				}
			}
			for _, index := range []string{"index.js", "index.json", "index.node"} {
				if fileExists(filepath.Join(base, index)) {
					return true
				}
			}
		}
	}
	return false
}

// nodeModulesPaths is Module._nodeModulePaths(dir).
func nodeModulesPaths(dir string) []string {
	var out []string
	dir = filepath.Clean(dir)
	for {
		if filepath.Base(dir) != "node_modules" {
			out = append(out, filepath.Join(dir, "node_modules"))
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return out
}

// selfReferences is Node's package self-reference: the package scope that
// contains dir is named pkg and has an "exports" field.
func selfReferences(dir, pkg string) bool {
	d := filepath.Clean(dir)
	for {
		if filepath.Base(d) == "node_modules" {
			return false
		}
		manifest := filepath.Join(d, "package.json")
		if b, err := os.ReadFile(manifest); err == nil {
			var m struct {
				Name    string          `json:"name"`
				Exports json.RawMessage `json:"exports"`
			}
			if json.Unmarshal(b, &m) != nil {
				return false
			}
			return m.Name == pkg && len(m.Exports) > 0 && string(m.Exports) != "null"
		}
		parent := filepath.Dir(d)
		if parent == d {
			return false
		}
		d = parent
	}
}

func validateRemoteAddonDependencies(log *diag.Logger, st *state.State) {
	decls := addonDecls(st)
	if len(decls) == 0 {
		return
	}
	for _, e := range decls {
		if e.decl.remote() {
			continue
		}
		dirs := addonResolutionDirs(st.RootDir, e.decl.File)
		if isPackageResolvable(e.decl.pkg(), dirs) {
			continue
		}
		log.Critical(diag.AddonNotInstalled, "Addon '"+e.namespace+"' ('"+jsString(e.decl.Package)+"') is wired with wireAddon but cannot be resolved from "+strings.Join(dirs, " or ")+" — every ref('"+e.namespace+":…') will resolve to nothing and the surface will be dead at runtime. Add it to the dependencies of "+filepath.Join(dirs[0], "package.json")+" and install, or remove the wireAddon call.")
	}

	type manifest struct {
		Dependencies    map[string]json.RawMessage `json:"dependencies"`
		DevDependencies map[string]json.RawMessage `json:"devDependencies"`
	}
	manifests := map[string]*manifest{}
	readManifest := func(path string) *manifest {
		if m, ok := manifests[path]; ok {
			return m
		}
		var m *manifest
		if b, err := os.ReadFile(path); err == nil {
			var parsed manifest
			if err := json.Unmarshal(b, &parsed); err != nil {
				log.Warn("Could not read " + path + " to verify remote addon dependencies: " + err.Error())
			} else {
				m = &parsed
			}
		}
		manifests[path] = m
		return m
	}

	var lock *remotesdk.Lock
	var lockErr error
	lockRead := false
	for _, e := range decls {
		if !e.decl.remote() || e.decl.rng() == "" {
			continue
		}
		if !lockRead {
			lock, lockErr = remotesdk.ReadLock(st.RootDir)
			lockRead = true
		}
		var reason string
		if lockErr != nil {
			reason = lockErr.Error()
		} else {
			_, reason = remotesdk.Check(st.RootDir, e.decl.pkg(), e.decl.rng(), lock)
		}
		if reason == "" {
			continue
		}
		log.Critical(diag.RemoteAddonNotDevDependency, "Remote addon '"+e.namespace+"' ('"+e.decl.pkg()+"@"+e.decl.rng()+"') has no SDK matching "+remotesdk.LockFile+": "+reason+". Run 'pikku all' to download it.")
	}

	for _, e := range decls {
		if !e.decl.remote() || e.decl.rng() != "" {
			continue
		}
		pkgJSONPath := filepath.Join(addonResolutionDirs(st.RootDir, e.decl.File)[0], "package.json")
		m := readManifest(pkgJSONPath)
		if m == nil {
			continue
		}
		pkg := jsString(e.decl.Package)
		if _, ok := m.DevDependencies[pkg]; ok {
			continue
		}
		if _, ok := m.Dependencies[pkg]; ok {
			log.Critical(diag.RemoteAddonNotDevDependency, "Remote addon '"+e.namespace+"' ('"+pkg+"') is a production dependency in "+pkgJSONPath+", but wireRemoteAddon consumes it for types only — its handlers run on the host. Move '"+pkg+"' from \"dependencies\" to \"devDependencies\".")
		} else {
			log.Critical(diag.RemoteAddonNotDevDependency, "Remote addon '"+e.namespace+"' ('"+pkg+"') is wired with wireRemoteAddon but is not in the \"devDependencies\" of "+pkgJSONPath+". Add '"+pkg+"' to \"devDependencies\" (types only).")
		}
	}
}

func validateRemoteAddonAuth(log *diag.Logger, st *state.State) {
	decls := addonDecls(st)
	if len(decls) == 0 {
		return
	}
	credentialNames := definitionIds(st.Credentials.Definitions, "")
	secretNames := definitionIds(st.Secrets.Definitions, "")
	for _, e := range decls {
		if !e.decl.remote() {
			continue
		}
		if id := e.decl.AuthCredentialId; id != nil && *id != "" && !credentialNames.has(*id) {
			log.Critical(diag.RemoteAddonAuthUnresolved, "Remote addon '"+e.namespace+"' binds auth.credentialId '"+*id+"', but no such credential is wired. Available credentials: "+orNone(credentialNames.items))
		}
		if id := e.decl.AuthSecretId; id != nil && *id != "" && !secretNames.has(*id) {
			log.Critical(diag.RemoteAddonAuthUnresolved, "Remote addon '"+e.namespace+"' binds auth.secretId '"+*id+"', but no such secret is wired. Available secrets: "+orNone(secretNames.items))
		}
	}
}
