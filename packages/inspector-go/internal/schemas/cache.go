package schemas

import (
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/jsjson"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// The on-disk TS-schema cache: readDiskTSSchemas / writeDiskTSSchemas of
// schema-generator.ts. It is a file of its own, go-ts-schemas.json, beside the
// TS engine's ts-schemas.json: the two generators are not byte-identical, so
// neither engine may serve the other's output. Nothing is held in memory; a
// cold process, a warm one and serve mode all read the same file.

const goSchemaCacheFile = "go-ts-schemas.json"

// schemaDep is SchemaDep: one file the schemas were derived from.
type schemaDep struct {
	Path    string  `json:"path"`
	MtimeMs float64 `json:"mtimeMs"`
	Size    int64   `json:"size"`
}

type schemaCacheEntry struct {
	Key     string                   `json:"key"`
	Schemas *state.Record[state.Raw] `json:"schemas"`
	Deps    []schemaDep              `json:"deps"`
}

var engineVersion = sync.OnceValue(func() string {
	exe, err := os.Executable()
	if err != nil {
		return "unknown"
	}
	st, err := os.Stat(exe)
	if err != nil {
		return "unknown"
	}
	return fmt.Sprintf("%d:%d", st.Size(), st.ModTime().UnixNano())
})

// schemaCacheKey is tsSchemaCacheKey, with the engine binary standing in for
// the inspector version and the names to generate added (Go generates only
// the names Zod did not cover).
func schemaCacheKey(cfg Config, content string, names []string) string {
	ap := 0
	if cfg.AdditionalProperties != nil && *cfg.AdditionalProperties {
		ap = 1
	}
	h := sha1.New()
	fmt.Fprintf(h, "inspector-go\x00bin:%s\x00ap:%d\x00ft:%s\x00names:%s\x00",
		engineVersion(), ap, strings.Join(cfg.SchemasFromTypes, ","), strings.Join(names, ","))
	h.Write([]byte(content))
	return hex.EncodeToString(h.Sum(nil))
}

func statDep(path string) (schemaDep, bool) {
	st, err := os.Stat(path)
	if err != nil {
		return schemaDep{}, false
	}
	return schemaDep{Path: path, MtimeMs: float64(st.ModTime().UnixNano()) / 1e6, Size: st.Size()}, true
}

// schemaDeps is fingerprintSchemaDeps. Files that are not on disk (the virtual
// root, the bundled default libs) are skipped, as the TS skips them.
func schemaDeps(files []string) []schemaDep {
	deps := []schemaDep{}
	for _, f := range files {
		if d, ok := statDep(f); ok {
			deps = append(deps, d)
		}
	}
	return deps
}

// schemaDepsUnchanged is schemaDepsUnchanged: mtime and size, a missing file
// reading as changed.
func schemaDepsUnchanged(deps []schemaDep) bool {
	for _, d := range deps {
		now, ok := statDep(d.Path)
		if !ok || now.MtimeMs != d.MtimeMs || now.Size != d.Size {
			return false
		}
	}
	return true
}

func readSchemaCache(log *diag.Logger, cacheDir, key string) (state.Record[state.Raw], bool) {
	var none state.Record[state.Raw]
	raw, err := os.ReadFile(filepath.Join(cacheDir, goSchemaCacheFile))
	if err != nil {
		return none, false
	}
	var entry schemaCacheEntry
	if err := json.Unmarshal(raw, &entry); err != nil {
		log.Debugf("Ignoring unreadable TS-schema cache: %s", err.Error())
		return none, false
	}
	if entry.Key != key || entry.Schemas == nil {
		return none, false
	}
	if !schemaDepsUnchanged(entry.Deps) {
		log.Debugf("Discarding TS-schema cache: a type it was built from changed")
		return none, false
	}
	return *entry.Schemas, true
}

func writeSchemaCache(log *diag.Logger, cacheDir, key string, schemas state.Record[state.Raw], deps []schemaDep) {
	b, err := jsjson.Marshal(schemaCacheEntry{Key: key, Schemas: &schemas, Deps: deps}, "")
	if err == nil {
		if err = os.MkdirAll(cacheDir, 0o755); err == nil {
			err = os.WriteFile(filepath.Join(cacheDir, goSchemaCacheFile), b, 0o644)
		}
	}
	if err != nil {
		log.Debugf("Failed to persist TS-schema cache: %s", err.Error())
	}
}
