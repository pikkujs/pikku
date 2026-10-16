// Package helpers dispatches the inspector's compiler-backed helpers that sit
// outside inspect(): collectSurface, readJsxLiteralText, readModuleSpecifiers,
// readTsconfigOutDir and the `pikku mocks` stub scan. Each method takes JSON
// params and returns a JSON-encodable result, so the same table backs the
// one-shot subcommands and `serve`.
package helpers

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/sourcescan"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/surface"
)

// Error is a failure the TypeScript wrapper rethrows; Name is the JS error
// class name when it is not a plain Error.
type Error struct {
	Name    string `json:"name,omitempty"`
	Message string `json:"message"`
}

type sourceFile struct {
	FileName string `json:"fileName"`
	Content  string `json:"content"`
}

type batch struct {
	Files []sourceFile `json:"files"`
}

type collectSurfaceParams struct {
	PackageDir     string      `json:"packageDir"`
	ImportsSubpath string      `json:"importsSubpath"`
	Subpaths       []string    `json:"subpaths"`
	Snippets       [][2]string `json:"snippets"`
}

type tsconfigParams struct {
	Tsconfig string `json:"tsconfig"`
}

type scanFrontendParams struct {
	RootDir string   `json:"rootDir"`
	Files   []string `json:"files"`
	Client  string   `json:"client"`
}

type scanHooksParams struct {
	File string `json:"file"`
	Text string `json:"text"`
}

// Methods lists the method names Dispatch answers.
var Methods = []string{
	"collectSurface",
	"readJsxLiteralText", "readJsxLiteralTextBatch",
	"readModuleSpecifiers", "readModuleSpecifiersBatch",
	"readTsconfigOutDir",
	"scanFrontend", "scanHooks",
}

// Has reports whether method is one of Methods.
func Has(method string) bool {
	for _, m := range Methods {
		if m == method {
			return true
		}
	}
	return false
}

func decode(params json.RawMessage, v any) error {
	if len(params) == 0 {
		params = []byte("{}")
	}
	if err := json.Unmarshal(params, v); err != nil {
		return fmt.Errorf("bad params: %w", err)
	}
	return nil
}

func nonNil[T any](v []T) []T {
	if v == nil {
		return []T{}
	}
	return v
}

// Dispatch runs one method. A returned *Error is a failure to report to the
// caller; any other error is too, as a plain Error.
func Dispatch(method string, params json.RawMessage) (any, *Error) {
	res, err := dispatch(method, params)
	if err == nil {
		return res, nil
	}
	var snippet *surface.UnknownSnippetError
	if errors.As(err, &snippet) {
		return nil, &Error{Name: "UnknownSnippetError", Message: snippet.Message}
	}
	return nil, &Error{Message: err.Error()}
}

func dispatch(method string, params json.RawMessage) (any, error) {
	switch method {
	case "collectSurface":
		var p collectSurfaceParams
		if err := decode(params, &p); err != nil {
			return nil, err
		}
		opts := surface.Options{ImportsSubpath: p.ImportsSubpath, Subpaths: p.Subpaths}
		if p.Snippets != nil {
			opts.Snippets = make([]surface.Snippet, len(p.Snippets))
			for i, s := range p.Snippets {
				opts.Snippets[i] = surface.Snippet{Name: s[0], Code: s[1]}
			}
		}
		return surface.Collect(p.PackageDir, opts)
	case "readJsxLiteralText":
		var p sourceFile
		if err := decode(params, &p); err != nil {
			return nil, err
		}
		return nonNil(sourcescan.ReadJsxLiteralText(p.FileName, p.Content)), nil
	case "readJsxLiteralTextBatch":
		var p batch
		if err := decode(params, &p); err != nil {
			return nil, err
		}
		out := make([][]sourcescan.JsxLiteralText, len(p.Files))
		for i, f := range p.Files {
			out[i] = nonNil(sourcescan.ReadJsxLiteralText(f.FileName, f.Content))
		}
		return out, nil
	case "readModuleSpecifiers":
		var p sourceFile
		if err := decode(params, &p); err != nil {
			return nil, err
		}
		return nonNil(sourcescan.ReadModuleSpecifiers(p.FileName, p.Content)), nil
	case "readModuleSpecifiersBatch":
		var p batch
		if err := decode(params, &p); err != nil {
			return nil, err
		}
		out := make([][]string, len(p.Files))
		for i, f := range p.Files {
			out[i] = nonNil(sourcescan.ReadModuleSpecifiers(f.FileName, f.Content))
		}
		return out, nil
	case "readTsconfigOutDir":
		var p tsconfigParams
		if err := decode(params, &p); err != nil {
			return nil, err
		}
		return sourcescan.ReadTsconfigOutDir(p.Tsconfig), nil
	case "scanFrontend":
		var p scanFrontendParams
		if err := decode(params, &p); err != nil {
			return nil, err
		}
		return sourcescan.ScanFrontend(p.RootDir, p.Files, p.Client), nil
	case "scanHooks":
		var p scanHooksParams
		if err := decode(params, &p); err != nil {
			return nil, err
		}
		return nonNil(sourcescan.ScanHooks(p.File, p.Text, nil)), nil
	}
	return nil, fmt.Errorf("unknown method %s", method)
}
