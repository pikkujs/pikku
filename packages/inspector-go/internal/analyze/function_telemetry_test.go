package analyze

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/protocol"
)

func TestFunctionTelemetryReachesMeta(t *testing.T) {
	dir := t.TempDir()
	src := `declare const pikkuFunc: any
export const quiet = pikkuFunc({ telemetry: { spans: 'off' }, func: async () => {} })
export const loud = pikkuFunc({ telemetry: { spans: 'always' }, func: async () => {} })
export const normal = pikkuFunc({ telemetry: { spans: 'on' }, func: async () => {} })
export const sampled = pikkuFunc({ telemetry: { spans: { sample: 0.25 } }, func: async () => {} })
export const everything = pikkuFunc({ telemetry: { spans: { sample: 1 } }, func: async () => {} })
export const plain = pikkuFunc({ func: async () => {} })
export const typo = pikkuFunc({ telemetry: { spans: 'errors' }, func: async () => {} })
export const outOfRange = pikkuFunc({ telemetry: { spans: { sample: 2 } }, func: async () => {} })
`
	files := map[string]string{
		"tsconfig.json": `{"compilerOptions":{"strict":true,"module":"nodenext","target":"esnext"},"include":["*.ts"]}`,
		"fns.ts":        src,
	}
	for name, text := range files {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	res, err := Run(protocol.Request{
		RouteFiles: []string{filepath.Join(dir, "fns.ts")},
		Options:    protocol.Options{Tsconfig: filepath.Join(dir, "tsconfig.json"), RootDir: dir},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]string{
		"quiet":      `{"spans":"off"}`,
		"loud":       `{"spans":"always"}`,
		"normal":     `{"spans":"on"}`,
		"sampled":    `{"spans":{"sample":0.25}}`,
		"everything": `{"spans":{"sample":1}}`,
		"plain":      `null`,
		"typo":       `null`,
		"outOfRange": `null`,
	}
	for name, expected := range want {
		meta := res.State.Functions.Meta.At(name)
		if meta == nil {
			t.Fatalf("no function meta for %s; diagnostics: %+v", name, res.Diagnostics)
		}
		got, err := json.Marshal(meta.Telemetry)
		if err != nil {
			t.Fatal(err)
		}
		if string(got) != expected {
			t.Errorf("%s telemetry = %s, want %s", name, got, expected)
		}
	}
}
