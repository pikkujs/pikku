// Command pikku-inspect is the Go port of @pikku/inspector's analysis phase.
//
//	pikku-inspect --stdin                 one Request on stdin, one Response on stdout
//	pikku-inspect inspect --stdin         the same
//	pikku-inspect serve                   NDJSON requests on stdin, responses on stdout,
//	                                      with parsed files cached between requests
//	pikku-inspect helper <method>         one helper call: params JSON on stdin,
//	                                      {"result"} or {"error"} on stdout
//	pikku-inspect [-timing] [-files f] [-schemas] <projectDir>
//	                                      legacy bench mode (reads pikku.config.json)
//
// The helper methods (collectSurface, readJsxLiteralText, readModuleSpecifiers,
// readTsconfigOutDir, scanFrontend, scanHooks and their batch forms) are
// listed in internal/helpers; `serve` answers them too.
package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/analyze"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/helpers"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/jsjson"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/program"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/protocol"
)

func main() {
	args := os.Args[1:]
	var err error
	switch {
	case len(args) == 1 && args[0] == "--stdin":
		err = runInspect(os.Stdin, os.Stdout)
	case len(args) >= 1 && args[0] == "inspect":
		if len(args) != 2 || args[1] != "--stdin" {
			err = fmt.Errorf("usage: pikku-inspect inspect --stdin")
		} else {
			err = runInspect(os.Stdin, os.Stdout)
		}
	case len(args) >= 1 && args[0] == "serve":
		err = runServe(os.Stdin, os.Stdout)
	case len(args) >= 1 && args[0] == "helper":
		if len(args) != 2 || !helpers.Has(args[1]) {
			err = fmt.Errorf("usage: pikku-inspect helper <method>, method one of %v", helpers.Methods)
		} else {
			err = runHelper(args[1], os.Stdin, os.Stdout)
		}
	default:
		err = runLegacy(args)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func writeJSON(w io.Writer, v any, indent string) error {
	b, err := jsjson.Marshal(v, indent)
	if err != nil {
		return err
	}
	_, err = w.Write(append(b, '\n'))
	return err
}

func runInspect(r io.Reader, w io.Writer) error {
	var req protocol.Request
	if err := json.NewDecoder(r).Decode(&req); err != nil {
		return fmt.Errorf("reading request: %w", err)
	}
	res, err := analyze.Run(req, nil)
	if err != nil {
		return err
	}
	return writeJSON(w, res, "")
}

// runServe answers one NDJSON request per line until stdin closes. Requests
// are handled one at a time; the SourceFile cache carries parsed and bound
// files from one request to the next, and every request gets a new checker.
func runServe(r io.Reader, w io.Writer) error {
	cache := program.NewCache()
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 1<<20), 256<<20)
	out := bufio.NewWriter(w)
	for sc.Scan() {
		line := sc.Bytes()
		if len(line) == 0 {
			continue
		}
		var head helperRequest
		if json.Unmarshal(line, &head) == nil && helpers.Has(head.Method) {
			result, herr := helpers.Dispatch(head.Method, head.Params)
			if err := writeJSON(out, helperResponse{ID: head.ID, Result: result, Error: herr}, ""); err != nil {
				return err
			}
			if err := out.Flush(); err != nil {
				return err
			}
			continue
		}
		var req protocol.ServeRequest
		resp := protocol.ServeResponse{}
		if err := json.Unmarshal(line, &req); err != nil {
			resp.Error = &protocol.ServeError{Message: "bad request: " + err.Error()}
		} else {
			resp.ID = req.ID
			switch req.Method {
			case "inspect":
				res, err := analyze.Run(req.Params, cache)
				if err != nil {
					resp.Error = &protocol.ServeError{Message: err.Error()}
				} else {
					resp.Result = res
				}
			default:
				resp.Error = &protocol.ServeError{Message: "unknown method " + req.Method}
			}
		}
		if err := writeJSON(out, resp, ""); err != nil {
			return err
		}
		if err := out.Flush(); err != nil {
			return err
		}
	}
	return sc.Err()
}

type helperRequest struct {
	ID     json.RawMessage `json:"id"`
	Method string          `json:"method"`
	Params json.RawMessage `json:"params"`
}

// helperResponse carries a helper's result even when it is null, which
// readTsconfigOutDir returns for "no outDir".
type helperResponse struct {
	ID     json.RawMessage `json:"id,omitempty"`
	Result any             `json:"result"`
	Error  *helpers.Error  `json:"error,omitempty"`
}

func runHelper(method string, r io.Reader, w io.Writer) error {
	params, err := io.ReadAll(r)
	if err != nil {
		return fmt.Errorf("reading params: %w", err)
	}
	result, herr := helpers.Dispatch(method, params)
	return writeJSON(w, helperResponse{Result: result, Error: herr}, "")
}
