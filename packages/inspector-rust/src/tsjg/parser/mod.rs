//! Port of Go `internal/tsjg/parser`: turns TypeScript AST nodes into the
//! intermediate type model (src/NodeParser* of the TypeScript implementation).
//!
//! Core (this file): [`Context`], the [`NodeParser`] / [`SubNodeParser`]
//! traits, node keys, the chain, circular-reference and top-ref wrappers
//! (parser.go, chain.go). The individual node parsers live in submodules, one
//! per Go file.
//!
//! Conventions shared by every parser:
//!
//! * A parser holds its child as `Rc<dyn NodeParser>` (the chain) and the
//!   checker as a [`Chk`]. Chain and parsers form an `Rc` cycle; the generator
//!   is short-lived and leaks it, as the Go GC would have freed it.
//! * Failures are `super::fail(msg)` (Go `panic(err)`).
//! * `NodeParser::create_type` takes an `Option` node because Go passes a nil
//!   `*ast.Node` (e.g. `node.Type()` of a member without a type) and lets the
//!   chain panic with an UnknownNodeError; `SubNodeParser::create_type` always
//!   has a node.

pub mod shared;

pub mod annotated_node_parser;
pub mod annotations_reader;
pub mod any_type_node_parser;
pub mod array_literal_expression_node_parser;
pub mod array_node_parser;
pub mod as_expression_node_parser;
pub mod basic_annotations_reader;
pub mod binary_expression_node_parser;
pub mod boolean_literal_node_parser;
pub mod boolean_type_node_parser;
pub mod call_expression_parser;
pub mod conditional_type_node_parser;
pub mod constructor_node_parser;
pub mod enum_node_parser;
pub mod expose_node_parser;
pub mod expression_with_type_arguments_node_parser;
pub mod extended_annotations_reader;
pub mod full_description;
pub mod function_node_parser;
pub mod hidden_type_node_parser;
pub mod identifier_node_parser;
pub mod import_type_node_parser;
pub mod indexed_access_type_node_parser;
pub mod infer_type_node_parser;
pub mod interface_and_class_node_parser;
pub mod intersection_node_parser;
pub mod intrinsic_node_parser;
pub mod is_assignable_to;
pub mod json5;
pub mod literal_node_parser;
pub mod mapped_type_node_parser;
pub mod named_tuple_member_node_parser;
pub mod narrow_type;
pub mod never_type_node_parser;
pub mod new_expression_parser;
pub mod null_literal_node_parser;
pub mod number_literal_node_parser;
pub mod number_type_node_parser;
pub mod object_literal_expression_node_parser;
pub mod object_type_node_parser;
pub mod optional_type_node_parser;
pub mod parameter_parser;
pub mod parenthesized_node_parser;
pub mod prefix_unary_expression_node_parser;
pub mod promise_node_parser;
pub mod property_access_expression_parser;
pub mod rest_type_node_parser;
pub mod satisfies_node_parser;
pub mod spread_element_node_parser;
pub mod string_literal_node_parser;
pub mod string_template_literal_node_parser;
pub mod string_type_node_parser;
pub mod symbol_type_node_parser;
pub mod tuple_node_parser;
pub mod type_alias_node_parser;
pub mod type_literal_node_parser;
pub mod typeof_node_parser;
pub mod type_operator_node_parser;
pub mod type_reference_node_parser;
pub mod undefined_type_node_parser;
pub mod union_node_parser;
pub mod unknown_type_node_parser;
pub mod void_type_node_parser;
use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::rc::Rc;

use tsrs_ast::Node;
use tsrs_checker::Checker;
use tsrs_compiler::CheckerHandle;
use tsrs_core::P;

use super::fail;
use super::types::{self, Ty, TypeKind};

/// The program's checker, shared by every parser. Borrow it only for the
/// duration of one checker call: parsers recurse through the chain, which
/// borrows again.
#[derive(Clone)]
pub struct Chk(pub Rc<RefCell<CheckerHandle>>);

impl Chk {
    pub fn new(h: CheckerHandle) -> Chk {
        Chk(Rc::new(RefCell::new(h)))
    }
    pub fn with<R>(&self, f: impl FnOnce(&mut Checker) -> R) -> R {
        let mut h = self.0.borrow_mut();
        f(&mut h)
    }
}

/// A position as Go's int: synthesized positions are -1.
pub fn text_pos(p: tsrs_core::TextPos) -> i64 {
    p.source_offset().map(|v| v as i64).unwrap_or(-1)
}

/// Identity of a node, for Go's `map[*ast.Node]...`.
pub fn node_id(node: &P<Node>) -> usize {
    &**node as *const Node as usize
}

/// Go `parser.Context`: tracks type parameters and arguments while descending
/// through generic instantiations (src/NodeParser.ts).
pub struct Context {
    cache_key: RefCell<String>,
    arguments: RefCell<Vec<Option<Ty>>>,
    parameters: RefCell<Vec<String>>,
    reference: Option<P<Node>>,
    default_argument: RefCell<HashMap<String, Ty>>,
}

impl Context {
    pub fn new(reference: Option<P<Node>>) -> Context {
        Context {
            cache_key: RefCell::new(String::new()),
            arguments: RefCell::new(Vec::new()),
            parameters: RefCell::new(Vec::new()),
            reference,
            default_argument: RefCell::new(HashMap::new()),
        }
    }

    /// `argument_type` may be None (Go's nil Type, from `GetArgument` of a
    /// parameter without an argument).
    pub fn push_argument(&self, argument_type: Option<Ty>) {
        self.arguments.borrow_mut().push(argument_type);
        self.cache_key.borrow_mut().clear();
    }

    pub fn push_parameter(&self, name: &str) {
        self.parameters.borrow_mut().push(name.to_string());
    }

    pub fn set_default(&self, name: &str, argument_type: Ty) {
        self.default_argument.borrow_mut().insert(name.to_string(), argument_type);
    }

    pub fn cache_key(&self) -> String {
        if self.cache_key.borrow().is_empty() {
            let r = match self.reference {
                Some(n) => get_node_key(n, self),
                None => String::new(),
            };
            let key = format!("[{:?},[{}]]", r, join_types(&self.arguments.borrow(), |t| t.id()));
            *self.cache_key.borrow_mut() = key;
        }
        self.cache_key.borrow().clone()
    }

    pub fn get_argument(&self, parameter_name: &str) -> Option<Ty> {
        let params = self.parameters.borrow();
        let args = self.arguments.borrow();
        let index = params.iter().position(|p| p == parameter_name);
        let arg = index.and_then(|i| args.get(i)).and_then(|a| a.clone());
        if arg.is_none() {
            if let Some(d) = self.default_argument.borrow().get(parameter_name) {
                return Some(d.clone());
            }
        }
        arg
    }

    pub fn parameters(&self) -> Vec<String> {
        self.parameters.borrow().clone()
    }

    pub fn arguments(&self) -> Vec<Option<Ty>> {
        self.arguments.borrow().clone()
    }
}

/// Renders each type with `render` and joins with commas; a nil type renders empty.
pub fn join_types(ts: &[Option<Ty>], render: impl Fn(&Ty) -> String) -> String {
    ts.iter().map(|t| t.as_ref().map(&render).unwrap_or_default()).collect::<Vec<_>>().join(",")
}

/// Creates a type from an AST node. `reference` is Some when the node is being
/// parsed to back a circular ReferenceType.
pub trait NodeParser {
    fn create_type(&self, node: Option<P<Node>>, ctx: &Context, reference: Option<&Ty>) -> Ty;
}

/// A node parser that can announce which nodes it handles.
pub trait SubNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool;
    fn create_type(&self, node: P<Node>, ctx: &Context, reference: Option<&Ty>) -> Ty;
}

// ---------------------------------------------------------------------------
// Node keys (src/Utils/nodeKey.ts)

fn base_dir() -> &'static str {
    use std::sync::OnceLock;
    static BASE: OnceLock<String> = OnceLock::new();
    BASE.get_or_init(|| match std::env::current_dir() {
        Ok(c) => std::fs::canonicalize(&c).unwrap_or(c).to_string_lossy().replace('\\', "/"),
        Err(_) => String::new(),
    })
}

/// A source file name the way node keys spell it: relative to the working
/// directory, with slashes flattened.
fn node_key_file_name(filename: &str) -> String {
    let base = base_dir();
    let mut f = filename;
    if !base.is_empty() {
        if let Some(rest) = f.strip_prefix(base).and_then(|r| r.strip_prefix('/')) {
            f = rest;
        }
    }
    f.replace('/', "_")
}

/// A key identifying a node (and its generic arguments) across parses.
pub fn get_node_key(node: P<Node>, ctx: &Context) -> String {
    let mut ids: Vec<String> = Vec::new();
    let mut cur = Some(node);
    let mut hashed_source: Option<usize> = None;
    let mut file_hash = String::new();
    while let Some(n) = cur {
        match tsrs_ast::get_source_file_of_node(n) {
            None => ids.push(format!("{:#x}", node_id(&n))),
            Some(source) => {
                let sid = &*source as *const _ as usize;
                if hashed_source != Some(sid) {
                    hashed_source = Some(sid);
                    file_hash = types::hash_str(&node_key_file_name(source.file_name()));
                }
                ids.push(file_hash.clone());
                ids.push(text_pos(n.pos()).to_string());
                ids.push(text_pos(n.end()).to_string());
            }
        }
        cur = n.parent();
    }
    let id = ids.join("-");
    let args = ctx.arguments();
    if args.is_empty() {
        return id;
    }
    format!("{id}<{}>", join_types(&args, |t| t.id()))
}

// ---------------------------------------------------------------------------
// Errors

/// Renders a node's kind and location for error messages.
pub fn describe_node(node: Option<P<Node>>) -> String {
    let Some(node) = node else { return "<nil>".into() };
    let mut pos = String::new();
    if let Some(source) = tsrs_ast::get_source_file_of_node(node) {
        // line/character need the line map; the position suffices for a message.
        pos = format!(" ({}:{})", source.file_name(), text_pos(node.pos()));
    }
    format!("kind={:?}{pos}", node.kind())
}

pub fn unknown_node_error(node: Option<P<Node>>) -> ! {
    fail(&format!("unknown node {}", describe_node(node)))
}

// ---------------------------------------------------------------------------
// chain.go

/// Delegates to the first sub-parser supporting a node and caches results per
/// node and context (src/ChainNodeParser.ts).
pub struct ChainNodeParser {
    pub type_checker: Chk,
    parsers: RefCell<Vec<Rc<dyn SubNodeParser>>>,
    type_caches: RefCell<HashMap<usize, HashMap<String, Ty>>>,
}

impl ChainNodeParser {
    pub fn new(type_checker: Chk) -> Rc<ChainNodeParser> {
        Rc::new(ChainNodeParser { type_checker, parsers: RefCell::new(Vec::new()), type_caches: RefCell::new(HashMap::new()) })
    }

    pub fn add_node_parser(&self, parser: Rc<dyn SubNodeParser>) -> &Self {
        self.parsers.borrow_mut().push(parser);
        self
    }

    fn parser_for(&self, node: P<Node>) -> Rc<dyn SubNodeParser> {
        let found = self.parsers.borrow().iter().find(|p| p.supports_node(node)).cloned();
        match found {
            Some(p) => p,
            None => unknown_node_error(Some(node)),
        }
    }
}

impl SubNodeParser for ChainNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        self.parsers.borrow().iter().any(|p| p.supports_node(node))
    }
    fn create_type(&self, node: P<Node>, ctx: &Context, reference: Option<&Ty>) -> Ty {
        NodeParser::create_type(self, Some(node), ctx, reference)
    }
}

impl NodeParser for ChainNodeParser {
    fn create_type(&self, node: Option<P<Node>>, ctx: &Context, reference: Option<&Ty>) -> Ty {
        // Unresolvable type references and import types hand over a nil
        // declaration; report that instead of dereferencing it.
        let Some(node) = node else { unknown_node_error(None) };
        let nid = node_id(&node);
        let cache_key = ctx.cache_key();
        let cached = self.type_caches.borrow().get(&nid).and_then(|c| c.get(&cache_key)).cloned();
        if let Some(t) = cached {
            return t;
        }
        let typ = self.parser_for(node).create_type(node, ctx, reference);
        if !matches!(&*typ, TypeKind::Reference(_)) {
            self.type_caches.borrow_mut().entry(nid).or_default().insert(cache_key, typ.clone());
        }
        typ
    }
}

/// Breaks cycles by handing out ReferenceTypes while a node is being parsed
/// (src/CircularReferenceNodeParser.ts).
pub struct CircularReferenceNodeParser {
    child: Rc<dyn SubNodeParser>,
    circular: RefCell<HashMap<String, Ty>>,
}

impl CircularReferenceNodeParser {
    pub fn new(child: Rc<dyn SubNodeParser>) -> Rc<CircularReferenceNodeParser> {
        Rc::new(CircularReferenceNodeParser { child, circular: RefCell::new(HashMap::new()) })
    }
}

impl SubNodeParser for CircularReferenceNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        self.child.supports_node(node)
    }
    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        let key = get_node_key(node, ctx);
        if let Some(c) = self.circular.borrow().get(&key) {
            return c.clone();
        }
        let reference = types::new_reference_type();
        self.circular.borrow_mut().insert(key.clone(), reference.clone());
        let typ = self.child.create_type(node, ctx, Some(&reference));
        if let TypeKind::Reference(r) = &*reference {
            r.set_type(typ.clone());
        }
        self.circular.borrow_mut().remove(&key);
        typ
    }
}

/// Optionally wraps the root type in a definition (src/TopRefNodeParser.ts).
pub struct TopRefNodeParser {
    child: Rc<dyn NodeParser>,
    full_name: RefCell<String>,
    top_ref: bool,
    _unused: Cell<()>,
}

impl TopRefNodeParser {
    pub fn new(child: Rc<dyn NodeParser>, full_name: String, top_ref: bool) -> Rc<TopRefNodeParser> {
        Rc::new(TopRefNodeParser { child, full_name: RefCell::new(full_name), top_ref, _unused: Cell::new(()) })
    }
}

impl NodeParser for TopRefNodeParser {
    fn create_type(&self, node: Option<P<Node>>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        let base = self.child.create_type(node, ctx, None);
        let is_def = matches!(&*base, TypeKind::Definition(_));
        match (self.top_ref, is_def) {
            (true, false) => types::new_definition_type(self.full_name.borrow().clone(), base),
            (false, true) => match &*base {
                TypeKind::Definition(d) => d.ty.clone(),
                _ => unreachable!(),
            },
            _ => base,
        }
    }
}
