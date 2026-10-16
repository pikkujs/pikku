//go:build !unix

package analyze

// processCPUMs is not measured off unix; stats report 0.
func processCPUMs() int { return 0 }
