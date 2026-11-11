package finalize

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/visit"
)

// LoadAddonSchemas ports load-addon-functions-meta.ts loadAddonSchemas: each
// local addon's generated `schemas/schemas/*.schema.json` is merged into
// state.schemas, without overwriting a schema the project already has.
func LoadAddonSchemas(_ *diag.Logger, st *state.State) {
	decls := &st.RPC.WireAddonDeclarations
	if decls.Len() == 0 {
		return
	}
	decls.Each(func(_ string, raw state.Raw) {
		var decl struct {
			Package string `json:"package"`
			File    string `json:"file"`
			Remote  any    `json:"remote"`
		}
		if json.Unmarshal(raw, &decl) != nil {
			return
		}
		if Truthy(decl.Remote) {
			return
		}
		metaPath := visit.ResolveAddonFile(st.RootDir, decl.File, decl.Package+"/.pikku/function/pikku-functions-meta.gen.json")
		if metaPath == "" {
			// MODULE_NOT_FOUND / ERR_PACKAGE_PATH_NOT_EXPORTED: skipped silently.
			return
		}
		schemasDir := filepath.Join(filepath.Dir(metaPath), "..", "schemas", "schemas")
		entries, err := os.ReadDir(schemasDir)
		if err != nil {
			return
		}
		for _, e := range entries {
			file := e.Name()
			if !strings.HasSuffix(file, ".schema.json") {
				continue
			}
			name := strings.Replace(file, ".schema.json", "", 1)
			if existing, ok := st.Schemas.Get(name); ok && Truthy(rawTruthy(existing)) {
				continue
			}
			b, err := os.ReadFile(filepath.Join(schemasDir, file))
			if err != nil {
				return
			}
			v, err := Parse(b)
			if err != nil {
				// The TS inner try/catch swallows a bad file as "no schemas".
				return
			}
			st.Schemas.Set(name, ToRaw(v))
		}
	})
}

func rawTruthy(r state.Raw) any {
	v, err := ParseRaw(r)
	if err != nil {
		return true
	}
	return v
}
