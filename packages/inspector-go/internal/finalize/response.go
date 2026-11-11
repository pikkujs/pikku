package finalize

import (
	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/protocol"
)

// Response finalizes an analysis Response in place: the state is finalized,
// finalize's diagnostics follow analysis's, ValidationPass marks the
// validation-pass bracket, and Finalized is set.
func Response(res *protocol.Response, opts Options) error {
	log := &diag.Logger{}
	log.Seed(res.Diagnostics)
	if err := Run(log, res.State, opts); err != nil {
		return &protocol.Failure{Message: err.Error(), Diagnostics: log.Entries()}
	}
	res.Diagnostics = log.Entries()
	res.ValidationPass = log.ValidationPass()
	res.Finalized = true
	return nil
}
