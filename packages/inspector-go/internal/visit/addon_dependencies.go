package visit

import (
	"fmt"
	"path/filepath"
	"regexp"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/jsjson"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/remotesdk"
)

// addonDependency is AddonDependency: an alias an addon calls, and the package
// and range it was written against.
type addonDependency struct {
	alias, pkg, rng string
}

// addonDependencies is AddonDependencies. form is "none", "list" or "map".
type addonDependencies struct {
	form         string
	names        []string
	dependencies []addonDependency
	invalid      []string
}

var addonAliasRe = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_-]*$`)

// declaredAddonNames is declaredAddonNames.
func (d addonDependencies) declaredNames() []string {
	switch d.form {
	case "list":
		return d.names
	case "map":
		out := []string{}
		for _, dep := range d.dependencies {
			out = append(out, dep.alias)
		}
		return out
	}
	return nil
}

func jsonStringify(v *ojson) string {
	return string(jsjson.MustMarshal(v))
}

// parseAddonDependencies is parseAddonDependencies: the `pikku.uses` value of
// an addon's package.json.
func parseAddonDependencies(uses *ojson) addonDependencies {
	if uses == nil || (!uses.isJSObject() && uses.scalar == nil) {
		return addonDependencies{form: "none"}
	}
	if uses.isArr {
		return addonDependencies{form: "list", names: uses.strings()}
	}
	if !uses.isObject() {
		return addonDependencies{form: "map", dependencies: []addonDependency{}, invalid: []string{
			fmt.Sprintf(`pikku.uses must be an object of { "<alias>": "<package>@<range>" }, got %s.`, jsonStringify(uses)),
		}}
	}
	out := addonDependencies{form: "map", dependencies: []addonDependency{}, invalid: []string{}}
	uses.obj.Each(func(alias string, spec *ojson) {
		if !addonAliasRe.MatchString(alias) {
			out.invalid = append(out.invalid, fmt.Sprintf("pikku.uses names '%s', which is not a valid alias. An alias starts with a letter and holds only letters, digits, '-' and '_'.", alias))
			return
		}
		s, ok := spec.str()
		if !ok {
			out.invalid = append(out.invalid, fmt.Sprintf("pikku.uses.%s must be a string '<package>@<range>', got %s.", alias, jsonStringify(spec)))
			return
		}
		name, rng, err := remotesdk.ParsePackage(s)
		if err != nil {
			out.invalid = append(out.invalid, fmt.Sprintf("pikku.uses.%s: %s", alias, err.Error()))
			return
		}
		if rng == "" {
			out.invalid = append(out.invalid, fmt.Sprintf("pikku.uses.%s is '%s', which has no version range. Write '%s@^1.0.0': the app that wires this addon is checked against it.", alias, s, name))
			return
		}
		out.dependencies = append(out.dependencies, addonDependency{alias: alias, pkg: name, rng: rng})
	})
	return out
}

// readAddonDependencies is readAddonDependencies.
func readAddonDependencies(packageDir string) addonDependencies {
	pj, err := readJSONFile(filepath.Join(packageDir, "package.json"))
	if err != nil {
		return addonDependencies{form: "none"}
	}
	return parseAddonDependencies(pj.get("pikku").get("uses"))
}

// recordDeclaredUses is recordDeclaredUses: the addons a wired package says it
// calls, written onto its declaration, and PKU348 for each one this wiring
// leaves unmapped.
func (s *Context) recordDeclaredUses(ns string, decl *addonDecl, dirs []string) {
	packageDir := findInstalledPackageDir(dirs, decl.pkg)
	if packageDir == "" {
		return
	}
	declared := readAddonDependencies(packageDir)
	if declared.form == "none" {
		return
	}
	raw, _ := s.State.RPC.WireAddonDeclarations.Get(ns)
	o, err := parseOJSON(raw)
	if err != nil || !o.isObject() {
		return
	}
	byAlias := map[string]addonDependency{}
	if declared.form == "map" {
		for _, message := range declared.invalid {
			s.Log.Critical(diag.AddonDependencyInvalid, fmt.Sprintf("%s (wired as '%s'): %s", decl.pkg, ns, message))
		}
		deps := &ojson{isArr: true, arr: []*ojson{}}
		for _, d := range declared.dependencies {
			byAlias[d.alias] = d
			entry := newOObject()
			entry.set("alias", ojsonString(d.alias))
			entry.set("package", ojsonString(d.pkg))
			entry.set("range", ojsonString(d.rng))
			deps.arr = append(deps.arr, entry)
		}
		o.set("dependencies", deps)
	}
	names := declared.declaredNames()
	list := &ojson{isArr: true, arr: []*ojson{}}
	for _, n := range names {
		list.arr = append(list.arr, ojsonString(n))
	}
	o.set("declaredUses", list)
	s.State.RPC.WireAddonDeclarations.Set(ns, o.raw())

	for _, needed := range names {
		if decl.uses != nil && decl.uses.At(needed) != "" {
			continue
		}
		if d, ok := byAlias[needed]; ok {
			s.Log.Critical(diag.AddonNeedsNotMapped, fmt.Sprintf(
				"%s calls %s@%s as '%s', but wireAddon('%s') does not map it. Wire %s and add uses: { '%s': '<name>' } to this wireAddon.",
				decl.pkg, d.pkg, d.rng, needed, ns, d.pkg, needed))
			continue
		}
		s.Log.Critical(diag.AddonNeedsNotMapped, fmt.Sprintf(
			"%s needs %s, but wireAddon('%s') does not map it. Wire %s and add uses: { '%s': '<name>' } to this wireAddon.",
			decl.pkg, needed, ns, needed, needed))
	}
}
