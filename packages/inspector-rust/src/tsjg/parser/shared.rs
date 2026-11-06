//! Port of Go `parser/shared.go`, `node_text.go`, `position.go`: helpers that
//! several node parsers use.

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

use tsrs_ast::{Kind, Node, Symbol};
use tsrs_core::P;

use super::{Chk, Context, NodeParser, node_id};
use crate::tsjg::fail;
use crate::tsjg::tsutils;
use crate::tsjg::types::{self, Ty};

/// Parses each node in the given context.
pub fn create_types(child: &Rc<dyn NodeParser>, nodes: &[P<Node>], ctx: &Context) -> Vec<Ty> {
    nodes.iter().map(|n| child.create_type(Some(*n), ctx, None)).collect()
}

/// The only element of `ts`, or a union of all of them.
pub fn single_or_union(ts: Vec<Ty>) -> Ty {
    if ts.len() == 1 {
        return ts.into_iter().next().unwrap();
    }
    types::new_union_type(&ts)
}

/// A sub context for `node` whose arguments are the given nodes, each parsed in
/// the parent context.
pub fn new_argument_context(child: &Rc<dyn NodeParser>, node: P<Node>, arguments: &[P<Node>], parent: &Context) -> Context {
    let sub = Context::new(Some(node));
    for a in create_types(child, arguments, parent) {
        sub.push_argument(Some(a));
    }
    sub
}

/// The sub context for a node's explicit type arguments.
pub fn new_type_argument_context(child: &Rc<dyn NodeParser>, node: P<Node>, parent: &Context) -> Context {
    new_argument_context(child, node, node.type_arguments(), parent)
}

/// The sub context for the value arguments of a call or new expression.
pub fn new_call_argument_context(child: &Rc<dyn NodeParser>, node: P<Node>, parent: &Context) -> Context {
    new_argument_context(child, node, node.arguments(), parent)
}

/// Copies every type parameter of `parent` except `skip`, with its resolved
/// argument, into `sub`.
pub fn inherit_parameters(sub: &Context, parent: &Context, skip: &str) {
    for p in parent.parameters() {
        if p == skip {
            continue;
        }
        sub.push_parameter(&p);
        sub.push_argument(parent.get_argument(&p));
    }
}

/// Pushes the names (and defaults) of a declaration's type parameters onto
/// `ctx`, zipping them positionally with the arguments the caller already
/// pushed. Defaults are parsed in `ctx` itself.
pub fn push_type_parameters(chk: &Chk, child: &Rc<dyn NodeParser>, node: P<Node>, ctx: &Context) {
    for type_param in node.type_parameters() {
        let name_symbol = tsutils::get_symbol_at_location(chk, Some(type_param.as_type_parameter_declaration().name()));
        let Some(name_symbol) = name_symbol else { fail("nil pointer dereference: no symbol for type parameter") };
        ctx.push_parameter(name_symbol.name());
        if let Some(default_type) = type_param.as_type_parameter_declaration().default_type() {
            ctx.set_default(name_symbol.name(), child.create_type(Some(default_type), ctx, None));
        }
    }
}

/// The additionalProperties value implied by a member list's index signature,
/// falling back to the parser's default.
pub fn member_additional_properties(
    child: &Rc<dyn NodeParser>,
    node: P<Node>,
    context: &Context,
    fallback: Option<types::AdditionalProperties>,
) -> Option<types::AdditionalProperties> {
    for member in node.members() {
        if member.kind() == Kind::IndexSignature {
            let t = child.create_type(member.type_node(), context, None);
            return Some(types::AdditionalProperties::Type(t));
        }
    }
    fallback
}

/// Renders a member's name, resolving computed names through the checker.
pub fn member_property_name(chk: &Chk, property_name: P<Node>) -> String {
    if property_name.kind() == Kind::ComputedPropertyName {
        if let Some(symbol) = tsutils::get_symbol_at_location(chk, Some(property_name)) {
            return symbol.name().to_string();
        }
    }
    node_text(property_name)
}

// ---------------------------------------------------------------------------
// node_text.go

/// ts.NodeBuilderFlags.NoTruncation / IgnoreErrors, as the Go constants spell them.
pub const NODE_BUILDER_FLAGS_NO_TRUNCATION: u32 = 1 << 0;
pub const NODE_BUILDER_FLAGS_IGNORE_ERRORS: u32 = (1 << 15) | (1 << 16) | (1 << 17) | (1 << 18) | (1 << 19) | (1 << 21) | (1 << 26);

/// ts.Node#getText(): source text without leading trivia; for synthesized
/// nodes without a source file, the node's `text`.
pub fn node_text(node: P<Node>) -> String {
    if tsrs_ast::get_source_file_of_node(node).is_none() {
        return node.text().to_string();
    }
    tsrs_scanner::get_text_of_node(node)
}

/// ts.Node#getFullText(): source text including leading trivia; synthesized
/// nodes yield "".
pub fn node_full_text(node: P<Node>) -> String {
    let Some(source) = tsrs_ast::get_source_file_of_node(node) else { return String::new() };
    let text = source.text();
    let (pos, end) = (super::text_pos(node.pos()), super::text_pos(node.end()));
    if pos < 0 || end > text.len() as i64 || pos > end {
        return String::new();
    }
    text[pos as usize..end as usize].to_string()
}

/// identifier -> symbol mappings produced by the node builder when types are
/// converted back to synthesized type nodes; one registry is shared by all
/// parsers of a chain.
#[derive(Default)]
pub struct SynthesizedSymbols {
    pub m: RefCell<HashMap<usize, P<Symbol>>>,
}

impl SynthesizedSymbols {
    pub fn new() -> Rc<SynthesizedSymbols> {
        Rc::new(SynthesizedSymbols::default())
    }
    pub fn lookup(&self, id: P<Node>) -> Option<P<Symbol>> {
        self.m.borrow().get(&node_id(&id)).copied()
    }
}

// ---------------------------------------------------------------------------
// position.go

/// 0-based line and character of `pos` (error messages only).
pub fn scanner_line_and_character(text: &str, pos: usize) -> (usize, usize) {
    let pos = pos.min(text.len());
    let prefix = &text.as_bytes()[..pos];
    let line = prefix.iter().filter(|b| **b == b'\n').count();
    let character = match prefix.iter().rposition(|b| *b == b'\n') {
        Some(last) => pos - last - 1,
        None => pos,
    };
    (line, character)
}
