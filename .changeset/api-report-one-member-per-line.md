---
'@pikku/core': patch
---

api-report.md reports public signatures, one member per line

The report was built from `declaration.getText()`, so a class arrived as its own
source — private fields and method bodies included — flattened onto a single
line. `PikkuWorkflowService` was 40,603 characters of one line.

That made the file unmergeable. One line is one conflict hunk, so two branches
touching different methods of the same class conflicted on a line neither had
meaningfully changed, and the repo paid for it every rebase.

Now each member is its own line and stops at its signature, with private members
dropped and inferred return types filled in from the checker. The file is a
quarter smaller, and every declaration in it parses as TypeScript — 42 of its 50
code fences previously did not, because collapsing a multi-line object type threw
away the newline that was serving as the member separator.

Also adds the report to `.prettierignore`: prettier pads the summary tables to
their widest cell, so one changed count rewrote all fifty rows, and it reflowed a
file that `api-report.test.ts` compares byte-for-byte.
