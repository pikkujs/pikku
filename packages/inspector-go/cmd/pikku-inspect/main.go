// Command pikku-inspect is the Pikku inspector: analysis and finalize.
//
//	pikku-inspect --stdin                 one Request on stdin, one finalized Response on stdout
//	pikku-inspect inspect --stdin         the same (a trailing --finalize is accepted and ignored)
//	pikku-inspect finalize --stdin        {state, diagnostics?, options} on stdin:
//	                                      finalize a serialized pre-finalize state
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
	"errors"
	"fmt"
	"io"
	"os"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/analyze"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/finalize"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/helpers"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/jsjson"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/program"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/protocol"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

func main() {
	args := os.Args[1:]
	var err error
	switch {
	case len(args) == 1 && args[0] == "--stdin":
		err = runInspect(os.Stdin, os.Stdout)
	case len(args) >= 1 && args[0] == "inspect":
		switch {
		case len(args) == 2 && args[1] == "--stdin",
			len(args) == 3 && args[1] == "--stdin" && args[2] == "--finalize",
			len(args) == 3 && args[1] == "--finalize" && args[2] == "--stdin":
			err = runInspect(os.Stdin, os.Stdout)
		default:
			err = fmt.Errorf("usage: pikku-inspect inspect --stdin")
		}
	case len(args) >= 1 && args[0] == "finalize":
		if len(args) != 2 || args[1] != "--stdin" {
			err = fmt.Errorf("usage: pikku-inspect finalize --stdin")
		} else {
			err = runFinalize(os.Stdin, os.Stdout)
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

// inspect runs analysis then finalize. A *protocol.Failure comes back as a
// Response with Error set, so the diagnostics logged before it still reach
// the wrapper; any other error is returned.
func inspect(req protocol.Request, cache *program.Cache) (*protocol.Response, error) {
	res, err := analyze.Run(req, cache)
	if err == nil {
		err = finalize.Response(res, req.Options)
	}
	var failure *protocol.Failure
	if errors.As(err, &failure) {
		return protocol.FailureResponse(failure), nil
	}
	if err != nil {
		return nil, err
	}
	return res, nil
}

func runInspect(r io.Reader, w io.Writer) error {
	var req protocol.Request
	if err := json.NewDecoder(r).Decode(&req); err != nil {
		return fmt.Errorf("reading request: %w", err)
	}
	res, err := inspect(req, nil)
	if err != nil {
		return err
	}
	return writeJSON(w, res, "")
}

// finalizeRequest is the `finalize --stdin` input: a serialized pre-finalize
// state (the TS reference's or the binary's own) and the options.
type finalizeRequest struct {
	State       *state.State      `json:"state"`
	Diagnostics []diag.Diagnostic `json:"diagnostics"`
	Options     protocol.Options  `json:"options"`
}

func runFinalize(r io.Reader, w io.Writer) error {
	var req finalizeRequest
	if err := json.NewDecoder(r).Decode(&req); err != nil {
		return fmt.Errorf("reading request: %w", err)
	}
	if req.State == nil {
		return fmt.Errorf("finalize: request has no state")
	}
	res := &protocol.Response{Protocol: protocol.Version, State: req.State, Diagnostics: req.Diagnostics}
	if res.Diagnostics == nil {
		res.Diagnostics = []diag.Diagnostic{}
	}
	if err := finalize.Response(res, req.Options); err != nil {
		var failure *protocol.Failure
		if !errors.As(err, &failure) {
			return err
		}
		res = protocol.FailureResponse(failure)
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
				res, err := inspect(req.Params, cache)
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
