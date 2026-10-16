module github.com/pikkujs/pikku/packages/inspector-go

go 1.26.0

replace (
	github.com/microsoft/typescript-go/shim/ast => ./shim/ast
	github.com/microsoft/typescript-go/shim/bundled => ./shim/bundled
	github.com/microsoft/typescript-go/shim/checker => ./shim/checker
	github.com/microsoft/typescript-go/shim/compiler => ./shim/compiler
	github.com/microsoft/typescript-go/shim/core => ./shim/core
	github.com/microsoft/typescript-go/shim/jsnum => ./shim/jsnum
	github.com/microsoft/typescript-go/shim/module => ./shim/module
	github.com/microsoft/typescript-go/shim/parser => ./shim/parser
	github.com/microsoft/typescript-go/shim/printer => ./shim/printer
	github.com/microsoft/typescript-go/shim/scanner => ./shim/scanner
	github.com/microsoft/typescript-go/shim/tsoptions => ./shim/tsoptions
	github.com/microsoft/typescript-go/shim/tspath => ./shim/tspath
	github.com/microsoft/typescript-go/shim/vfs/osvfs => ./shim/vfs/osvfs
)

require (
	github.com/microsoft/typescript-go/shim/ast v0.0.0-00010101000000-000000000000
	github.com/microsoft/typescript-go/shim/bundled v0.0.0-00010101000000-000000000000
	github.com/microsoft/typescript-go/shim/checker v0.0.0-00010101000000-000000000000
	github.com/microsoft/typescript-go/shim/compiler v0.0.0-00010101000000-000000000000
	github.com/microsoft/typescript-go/shim/core v0.0.0-00010101000000-000000000000
	github.com/microsoft/typescript-go/shim/jsnum v0.0.0-00010101000000-000000000000
	github.com/microsoft/typescript-go/shim/module v0.0.0-00010101000000-000000000000
	github.com/microsoft/typescript-go/shim/parser v0.0.0-00010101000000-000000000000
	github.com/microsoft/typescript-go/shim/printer v0.0.0-00010101000000-000000000000
	github.com/microsoft/typescript-go/shim/scanner v0.0.0-00010101000000-000000000000
	github.com/microsoft/typescript-go/shim/tsoptions v0.0.0-00010101000000-000000000000
	github.com/microsoft/typescript-go/shim/tspath v0.0.0-00010101000000-000000000000
	github.com/microsoft/typescript-go/shim/vfs/osvfs v0.0.0-00010101000000-000000000000
	golang.org/x/text v0.42.0
	golang.org/x/tools v0.50.0
)

require (
	github.com/go-json-experiment/json v0.0.0-20260623181947-01eb4420fa68 // indirect
	github.com/klauspost/cpuid/v2 v2.2.10 // indirect
	github.com/microsoft/typescript-go v0.0.0-20260708042240-2bd066d87f5b // indirect
	github.com/zeebo/xxh3 v1.1.0 // indirect
	golang.org/x/mod v0.41.0 // indirect
	golang.org/x/sync v0.24.0 // indirect
	golang.org/x/sys v0.49.0 // indirect
)
