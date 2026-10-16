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
	Verbose  bool
	DebugOut io.Writer
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
