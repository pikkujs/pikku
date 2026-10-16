// Command pikku-inspect is the Go port of @pikku/inspector's analysis phase.
//
//	pikku-inspect --stdin                 one Request on stdin, one Response on stdout
//	pikku-inspect inspect --stdin         the same
//	pikku-inspect inspect --stdin --finalize
//	                                      analysis then the Go finalize pass
//	                                      (testing until cutover)
//	pikku-inspect finalize --stdin        {state, diagnostics?, options} on stdin:
//	                                      finalize a serialized pre-finalize
//	                                      state (finalize parity)
//	pikku-inspect serve                   NDJSON requests on stdin, responses on stdout,
//	                                      with parsed files cached between requests
//	pikku-inspect [-timing] [-files f] [-schemas] <projectDir>
//	                                      legacy bench mode (reads pikku.config.json)
//
// Further subcommands (collectSurface, readJsxLiteralText,
// readModuleSpecifiers, readTsconfigOutDir) slot into the same switch.
package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/analyze"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/finalize"
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
		case len(args) == 2 && args[1] == "--stdin":
			err = runInspect(os.Stdin, os.Stdout)
		case len(args) == 3 && args[1] == "--stdin" && args[2] == "--finalize",
			len(args) == 3 && args[1] == "--finalize" && args[2] == "--stdin":
			err = runInspectFinalize(os.Stdin, os.Stdout)
		default:
			err = fmt.Errorf("usage: pikku-inspect inspect --stdin [--finalize]")
		}
	case len(args) >= 1 && args[0] == "finalize":
		if len(args) != 2 || args[1] != "--stdin" {
			err = fmt.Errorf("usage: pikku-inspect finalize --stdin")
		} else {
			err = runFinalize(os.Stdin, os.Stdout)
		}
	case len(args) >= 1 && args[0] == "serve":
		err = runServe(os.Stdin, os.Stdout)
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

func runInspectFinalize(r io.Reader, w io.Writer) error {
	var req protocol.Request
	if err := json.NewDecoder(r).Decode(&req); err != nil {
		return fmt.Errorf("reading request: %w", err)
	}
	res, err := analyze.Run(req, nil)
	if err != nil {
		return err
	}
	if err := finalize.Response(res, req.Options); err != nil {
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
