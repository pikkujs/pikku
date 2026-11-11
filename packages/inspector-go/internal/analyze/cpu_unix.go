//go:build unix

package analyze

import "syscall"

// processCPUMs is the process's user + system CPU time so far, in ms.
func processCPUMs() int {
	var ru syscall.Rusage
	if err := syscall.Getrusage(syscall.RUSAGE_SELF, &ru); err != nil {
		return 0
	}
	return int((ru.Utime.Nano() + ru.Stime.Nano()) / 1e6)
}
