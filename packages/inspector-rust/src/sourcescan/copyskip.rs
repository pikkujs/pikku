//! Port of `copyskip.go`: the name lists `stringLiteralCopy` skips.

use regex::Regex;
use std::sync::OnceLock;

fn lazy(cell: &'static OnceLock<Regex>, p: &str) -> &'static Regex {
    cell.get_or_init(|| Regex::new(p).unwrap_or_else(|e| panic!("{p}: {e}")))
}

/// Go `nonCopyProps`.
pub const NON_COPY_PROPS: &[&str] = &[
    "className", "class", "id", "key", "href", "src", "type", "name",
    "value", "defaultValue", "variant", "size", "to", "rel", "target", "role",
    "code", "sample", "lang", "language", "style", "color", "testId",
];

/// Go `nonCopyCallRoots`.
pub const NON_COPY_CALL_ROOTS: &[&str] = &[
    "console", "logger", "log", "debug", "m", "asI18n", "asI18nStub", "sep",
    "require", "describe", "it", "test", "expect", "assert", "suite", "before",
    "after", "beforeEach", "afterEach", "cn", "clsx", "cva", "twMerge", "classNames",
    "JSON", "Intl", "Symbol", "Object", "Reflect", "RegExp", "Date", "process",
    "path", "fs", "sql", "css", "tw", "import", "git", "execa",
    "scenario", "workflow", "res", "reply",
];

/// Go `nonCopyMethods`.
pub const NON_COPY_METHODS: &[&str] = &[
    "log", "debug", "info", "warn", "trace", "test", "match", "matchAll",
    "replace", "replaceAll", "split", "join", "includes", "startsWith", "endsWith", "indexOf",
    "lastIndexOf", "localeCompare", "padStart", "padEnd", "querySelector", "querySelectorAll", "getAttribute", "setAttribute",
    "removeAttribute", "hasAttribute", "addEventListener", "removeEventListener", "on", "once", "off", "emit",
    "get", "set", "has", "delete", "append", "getItem", "setItem", "removeItem",
    "prepare", "exec", "run", "all", "query", "execute", "select", "from",
    "where", "with", "withSchema", "raw", "describe", "it", "equal", "deepEqual",
    "strictEqual", "notEqual", "ok", "throws", "rejects", "toBe", "toEqual", "toContain",
    "toMatch", "toThrow", "invalidateQueries", "setQueryData", "getQueryData", "rpc", "invoke", "func",
    "execSync", "spawn", "spawnSync", "readFile", "writeFile", "resolve", "relative", "cwd",
    "parse", "format", "attr", "css", "closest", "matches", "getElementById", "getByRole",
    "getByText", "getByLabelText", "getByTestId", "findByText", "findByRole", "createContext", "createLogger", "child",
    "tag", "header", "headers", "setHeader", "getHeader", "cookie", "redirect", "navigate",
    "push", "to", "is", "type", "literal", "enum", "string", "default",
    "regex", "column", "table", "index", "unique", "references", "sort", "orderBy",
    "groupBy", "selectFrom", "insertInto", "updateTable", "deleteFrom", "as", "end", "write",
    "writeHead", "send", "do", "given", "when", "then", "and", "step",
    "commit",
];

pub fn copy_prop_name_skip() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    lazy(&R, r"^(className|class|classes|classNames|style|styles|sx|css|tw|id|ids|key|keys|href|src|url|uri|path|route|to|from|type|kind|name|slug|value|values|variant|size|color|colour|icon|role|rel|target|lang|locale|language|method|mode|status|format|pattern|regex|selector|query|sql|command|cmd|cwd|dir|file|filename|ext|mime|mimeType|contentType|accept|env|token|secret|channel|topic|event|action|scope|permission|permissions|resource|table|column|field|model|provider|version|origin|host|domain|port|encoding|charset|transition|animation|display|position|width|height|font|fontFamily|fontSize|fontWeight|border|background|boxShadow|shadow|content|data|testId|fill|stroke|d|viewBox|transform|cursor|ariaRole|as|queryKey|queryFn|cron|schedule|expression|template|prompt|instructions|systemPrompt|system|description_for_model)$|(Class|ClassName|Classes|Style|Styles|Id|Ids|Key|Url|Href|Path|Selector|Regex|Pattern|Icon|Color|Env|Slug|Type|Kind|Name|Sql|Query|Cmd|Command|Dir|File|Mime|Format|Token|Secret|Prompt|Template)$")
}

pub fn copy_skip_file() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    lazy(&R, r"(\.(stories|test|spec|scenario|feature|step|function|workflow|agent|wiring)\.tsx?$|(^|/)(__tests__|tests?|scenarios|e2e)/|\.config\.[cm]?tsx?$)")
}

pub fn copy_entry_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    lazy(&R, r"^(use[A-Z]|create[A-Z]|define[A-Z]|wire[A-Z]|pikku[A-Z]|import|require)")
}

pub fn copy_error_suffix() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    lazy(&R, r"Error$")
}

pub fn copy_throw_prefix() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    lazy(&R, r"^(throw|fail|panic|invariant)")
}

pub fn copy_new_ignored() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    lazy(&R, r"Error$|^(RegExp|Date|URL|Map|Set|Headers|URLSearchParams|Intl[0-9A-Za-z_]*)$")
}

pub fn copy_aria_copy() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    lazy(&R, r"^aria-(label|description)$")
}

pub fn copy_constant_name() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    lazy(&R, r"^[A-Z][A-Z0-9_]*$")
}

pub fn copy_message_name() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    lazy(&R, r"MESSAGE|COPY|TEXT|LABEL|TITLE|HINT")
}

