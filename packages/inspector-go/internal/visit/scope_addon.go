package visit

import (
	"encoding/json"
	"os"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/jsjson"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// loadAddonScopes ports the scopes part of load-addon-functions-meta.ts: an
// addon's own scope trees join the host's definitions, unless the host
// already defines one by that name, with an origin naming the package the
// host installed it as.
func (s *Context) loadAddonScopes(decl *addonDecl, dir string) {
	path := resolvePackageSubpath(dir, decl.pkg, ".pikku/scopes/pikku-scopes-meta.gen.json")
	if path == "" {
		return
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return
	}
	var meta state.Record[state.Raw]
	if json.Unmarshal(raw, &meta) != nil {
		return
	}
	meta.Each(func(key string, defRaw state.Raw) {
		for _, existing := range s.State.Scopes.Definitions {
			var d struct {
				Name *string `json:"name"`
			}
			if json.Unmarshal(existing, &d) == nil && d.Name != nil && *d.Name == key {
				return
			}
		}
		var def state.Record[state.Raw]
		if json.Unmarshal(defRaw, &def) != nil {
			return
		}
		var prev struct {
			Origin *struct {
				Kind        string          `json:"kind"`
				DisplayName json.RawMessage `json:"displayName"`
			} `json:"origin"`
		}
		_ = json.Unmarshal(defRaw, &prev)
		origin := state.NewRecord[state.Raw]()
		origin.Set("kind", state.Raw(`"addon"`))
		origin.Set("package", state.Raw(jsjson.MustMarshal(decl.pkg)))
		if prev.Origin != nil && prev.Origin.Kind == "addon" && len(prev.Origin.DisplayName) > 0 {
			origin.Set("displayName", state.Raw(prev.Origin.DisplayName))
		}
		def.Set("origin", state.Raw(jsjson.MustMarshal(origin)))
		s.State.Scopes.Definitions = append(s.State.Scopes.Definitions, state.Raw(jsjson.MustMarshal(&def)))
	})
}
