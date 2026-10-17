// Package diag is the Go side of InspectorLogger: it records what the TS
// visitors pass to logger.critical / error / warn / info / debug, with the same
// code strings and message text, for the protocol's `diagnostics` array.
package diag

//go:generate sh gen_codes.sh

import (
	"fmt"
	"io"
	"sync"
)

// Code is an ErrorCode value ("PKU236").
type Code string

type Level string

const (
	Critical Level = "critical"
	Error    Level = "error"
	Warn     Level = "warn"
	Info     Level = "info"
	Debug    Level = "debug"
)

// Diagnostic is one protocol diagnostics entry.
type Diagnostic struct {
	Level   Level  `json:"level"`
	Code    Code   `json:"code,omitempty"`
	Message string `json:"message"`
}

// Logger collects diagnostics. Debug lines are only kept when Verbose is set
// (TS `logger.debug` is likewise dropped unless the CLI runs with --verbose),
// and are mirrored to DebugOut when it is non-nil.
type Logger struct {
	mu       sync.Mutex
	entries  []Diagnostic
	pass     *Pass
	Verbose  bool
	DebugOut io.Writer
}

// Pass is the half-open range [Start, End) of entries logged inside a
// validation pass.
type Pass struct {
	Start int `json:"start"`
	End   int `json:"end"`
}

// BeginValidationPass is logger.beginValidationPass(): the CLI logger drops
// what earlier passes reported once a new one begins.
func (l *Logger) BeginValidationPass() {
	l.mu.Lock()
	l.pass = &Pass{Start: len(l.entries), End: -1}
	l.mu.Unlock()
}

// EndValidationPass is logger.endValidationPass().
func (l *Logger) EndValidationPass() {
	l.mu.Lock()
	if l.pass != nil {
		l.pass.End = len(l.entries)
	}
	l.mu.Unlock()
}

// ValidationPass returns the last validation pass, or nil when none ran. A
// pass that was begun but not ended runs to the last entry.
func (l *Logger) ValidationPass() *Pass {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.pass == nil {
		return nil
	}
	p := *l.pass
	if p.End < 0 {
		p.End = len(l.entries)
	}
	return &p
}

func (l *Logger) add(d Diagnostic) {
	l.mu.Lock()
	l.entries = append(l.entries, d)
	l.mu.Unlock()
}

// Critical is logger.critical(code, message).
func (l *Logger) Critical(code Code, message string) {
	l.add(Diagnostic{Level: Critical, Code: code, Message: message})
}

// Diagnostic is logger.diagnostic({ severity, code, message }).
func (l *Logger) Diagnostic(level Level, code Code, message string) {
	l.add(Diagnostic{Level: level, Code: code, Message: message})
}

func (l *Logger) Error(message string) { l.add(Diagnostic{Level: Error, Message: message}) }
func (l *Logger) Warn(message string)  { l.add(Diagnostic{Level: Warn, Message: message}) }
func (l *Logger) Info(message string)  { l.add(Diagnostic{Level: Info, Message: message}) }

func (l *Logger) Debugf(format string, args ...any) {
	if !l.Verbose && l.DebugOut == nil {
		return
	}
	msg := fmt.Sprintf(format, args...)
	if l.DebugOut != nil {
		fmt.Fprintln(l.DebugOut, msg)
	}
	if l.Verbose {
		l.add(Diagnostic{Level: Debug, Message: msg})
	}
}

// HasCriticalErrors is logger.hasCriticalErrors().
func (l *Logger) HasCriticalErrors() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	for _, d := range l.entries {
		if d.Level == Critical {
			return true
		}
	}
	return false
}

// Entries returns the diagnostics in the order they were logged; never nil.
func (l *Logger) Entries() []Diagnostic {
	l.mu.Lock()
	defer l.mu.Unlock()
	return append([]Diagnostic{}, l.entries...)
}

// Seed appends entries recorded by an earlier logger, so a later phase (the
// finalize pass on an analyzed Response) continues the same diagnostics list.
func (l *Logger) Seed(entries []Diagnostic) {
	l.mu.Lock()
	l.entries = append(l.entries, entries...)
	l.mu.Unlock()
}
