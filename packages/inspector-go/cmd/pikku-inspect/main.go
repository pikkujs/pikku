package main

import (
	"fmt"

	"github.com/microsoft/typescript-go/shim/compiler"
)

func main() { fmt.Println(compiler.NewProgram != nil) }
