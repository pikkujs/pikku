package schemas

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"time"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// helperPipeGrace bounds how long Wait lingers on pipes a helper's own children
// still hold open after the helper itself is gone.
const helperPipeGrace = 2 * time.Second

// VendorSchemaConverter turns schemaLookup entries (Zod values the analysis
// found as function input/output schemas) into JSON Schema. The TS inspector
// does this in-process by importing the user's modules through tsx and calling
// z.toJSONSchema: the schema is a runtime value, so no amount of static
// analysis recovers it, and Go has to hand it to a JavaScript runtime.
type VendorSchemaConverter interface {
	Convert(ctx context.Context, refs []VendorRef) (VendorResult, error)
}

type VendorRef struct {
	Name string
	state.SchemaRef
}

// VendorResult is generateZodSchemas' outcome: the schemas converted, in
// processing order, and one message per schema that could not be.
type VendorResult struct {
	Schemas []VendorSchema
	Errors  []string
}

type VendorSchema struct {
	Name string
	// Schema is JSON.stringify output, so it is stored verbatim.
	Schema state.Raw
	// TypeText is zodToTypeText's rendering, added to the typesMap as a
	// custom type so the generated TypeScript can name the schema.
	TypeText string
}

// NodeConverter runs a helper script (scripts/vendor-schemas.mjs speaks the
// protocol) under Node: the schemaLookup goes in on stdin as the TS serializer
// writes it, the result comes back on stdout.
type NodeConverter struct {
	// Node is the node binary; "node" when empty.
	Node   string
	Script string
	// Dir is the working directory, normally the project root, so the user's
	// modules resolve their dependencies as they do under the TS inspector.
	Dir string
}

func (c NodeConverter) Convert(ctx context.Context, refs []VendorRef) (VendorResult, error) {
	lookup := make([][2]any, len(refs))
	for i, r := range refs {
		lookup[i] = [2]any{r.Name, r.SchemaRef}
	}
	in, err := json.Marshal(lookup)
	if err != nil {
		return VendorResult{}, err
	}
	node := c.Node
	if node == "" {
		node = "node"
	}
	cmd := exec.CommandContext(ctx, node, c.Script)
	cmd.Dir = c.Dir
	cmd.Stdin = bytes.NewReader(in)
	cmd.WaitDelay = helperPipeGrace
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return VendorResult{}, err
	}
	failed := func(err error) error {
		return fmt.Errorf("vendor schema conversion (%s %s) failed: %w\n%s", node, c.Script, err, stderr.Bytes())
	}
	if err := cmd.Start(); err != nil {
		return VendorResult{}, failed(err)
	}
	var out struct {
		Schemas [][2]json.RawMessage `json:"schemas"`
		Errors  []string             `json:"errors"`
	}
	answer := make(chan error, 1)
	go func() { answer <- json.NewDecoder(stdout).Decode(&out) }()
	var decodeErr error
	select {
	case decodeErr = <-answer:
	case <-ctx.Done():
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
		return VendorResult{}, failed(ctx.Err())
	}
	switch {
	case decodeErr == nil:
		// The complete answer is in hand, so the helper's exit no longer matters.
		// Waiting for it can hang forever: Node can deadlock inside process.exit,
		// its main thread joining a V8 worker that is waiting on that thread for a
		// GC. Any other runtime stalling on the way out would look the same.
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
	case errors.Is(decodeErr, io.EOF), errors.Is(decodeErr, io.ErrUnexpectedEOF):
		// Stdout closed short of an answer, so the exit status says why.
		if err := cmd.Wait(); err != nil {
			return VendorResult{}, failed(err)
		}
		return VendorResult{}, fmt.Errorf("vendor schema conversion returned invalid output: %w", decodeErr)
	default:
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
		return VendorResult{}, fmt.Errorf("vendor schema conversion returned invalid output: %w", decodeErr)
	}
	res := VendorResult{Errors: out.Errors}
	for _, pair := range out.Schemas {
		var name string
		var body struct {
			Schema   json.RawMessage `json:"schema"`
			TypeText string          `json:"typeText"`
		}
		if err := json.Unmarshal(pair[0], &name); err != nil {
			return VendorResult{}, err
		}
		if err := json.Unmarshal(pair[1], &body); err != nil {
			return VendorResult{}, err
		}
		res.Schemas = append(res.Schemas, VendorSchema{Name: name, Schema: state.Raw(body.Schema), TypeText: body.TypeText})
	}
	return res, nil
}
