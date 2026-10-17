package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/analyze"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/protocol"
)

// The legacy bench entry point: `pikku-inspect [-timing] [-files out.txt]
// [-schemas] <projectDir>` reads the project's pikku.config.json, finds the
// route files the CLI would, and prints the same Response as `inspect`.

type pikkuConfig struct {
	RootDir          string   `json:"rootDir"`
	Tsconfig         string   `json:"tsconfig"`
	SrcDirectories   []string `json:"srcDirectories"`
	IgnoreFiles      []string `json:"ignoreFiles"`
	SchemasFromTypes []string `json:"schemasFromTypes"`
}

func runLegacy(args []string) error {
	fl := flag.NewFlagSet("pikku-inspect", flag.ExitOnError)
	timing := fl.Bool("timing", false, "print timings to stderr")
	filesOut := fl.String("files", "", "write the root file list here")
	schemas := fl.Bool("schemas", false, "generate schemas (schemaConfig from pikku.config.json)")
	setupOnly := fl.Bool("setup-only", false, "run the setup sweep only")
	fl.Parse(args)
	if fl.NArg() != 1 {
		return fmt.Errorf("usage: pikku-inspect [-timing] [-files out.txt] [-schemas] <projectDir>")
	}
	start := time.Now()
	projectDir, _ := filepath.Abs(fl.Arg(0))
	raw, err := os.ReadFile(filepath.Join(projectDir, "pikku.config.json"))
	if err != nil {
		return err
	}
	var cfg pikkuConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return err
	}
	if cfg.RootDir == "" {
		cfg.RootDir = "."
	}
	rootDir := filepath.ToSlash(filepath.Join(projectDir, cfg.RootDir))
	if len(cfg.IgnoreFiles) > 0 {
		fmt.Fprintln(os.Stderr, "warning: custom ignoreFiles are not supported in legacy mode; using defaults")
	}
	files := findSourceFiles(rootDir, cfg.SrcDirectories)
	if *filesOut != "" {
		sorted := append([]string(nil), files...)
		sort.Strings(sorted)
		if err := os.WriteFile(*filesOut, []byte(strings.Join(sorted, "\n")), 0o644); err != nil {
			return err
		}
	}
	req := protocol.Request{RouteFiles: files, Options: protocol.Options{RootDir: rootDir, SetupOnly: *setupOnly}}
	if cfg.Tsconfig != "" {
		req.Options.Tsconfig = filepath.Join(projectDir, cfg.Tsconfig)
		if *schemas {
			req.Options.SchemaConfig = &protocol.SchemaConfig{
				Tsconfig: req.Options.Tsconfig, SchemasFromTypes: cfg.SchemasFromTypes,
				CacheDir:     filepath.Join(projectDir, "node_modules", ".cache", "pikku"),
				VendorScript: findVendorScript(projectDir),
			}
		}
	}
	res, err := analyze.Run(req, nil)
	if err != nil {
		return err
	}
	if err := writeJSON(os.Stdout, res, "  "); err != nil {
		return err
	}
	if *timing {
		fmt.Fprintf(os.Stderr, `{"files":%d,"projectFiles":%d,"functions":%d,"analyzeMs":%d,"totalMs":%d}`+"\n",
			len(files), res.Stats.ProjectFiles, res.State.Functions.Meta.Len(), res.Stats.WallMs, time.Since(start).Milliseconds())
	}
	return nil
}

// findSourceFiles mirrors packages/cli/src/utils/find-source-files.ts with the
// default ignoreFiles: every *.ts under each srcDirectory (tinyglobby skips
// dot-files/dirs by default), minus *.test.ts, *.spec.ts, node_modules, dist.
func findSourceFiles(rootDir string, srcDirs []string) []string {
	var out []string
	for _, dir := range srcDirs {
		base := filepath.Join(rootDir, dir)
		_ = filepath.WalkDir(base, func(p string, d fs.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			name := d.Name()
			if d.IsDir() {
				if p != base && (strings.HasPrefix(name, ".") || name == "node_modules" || name == "dist") {
					return filepath.SkipDir
				}
				return nil
			}
			if strings.HasPrefix(name, ".") || !strings.HasSuffix(name, ".ts") ||
				strings.HasSuffix(name, ".test.ts") || strings.HasSuffix(name, ".spec.ts") {
				return nil
			}
			out = append(out, filepath.ToSlash(p))
			return nil
		})
	}
	return out
}

// findVendorScript looks for this repo's scripts/vendor-schemas.mjs above the
// project, which is where legacy (bench) runs find it.
func findVendorScript(projectDir string) string {
	dir, _ := filepath.Abs(projectDir)
	for {
		p := filepath.Join(dir, "packages", "inspector-go", "scripts", "vendor-schemas.mjs")
		if _, err := os.Stat(p); err == nil {
			return p
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return ""
		}
		dir = parent
	}
}
