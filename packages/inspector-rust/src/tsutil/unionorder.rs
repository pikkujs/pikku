//! Port of Go `internal/tsutil/unionorder.go`: `type_to_string`, `type_to_string_at`,
//! `type_to_type_node` (the node builder with union members and mapped-type
//! properties in Strada's order) and `reorder_union_type_nodes`. The typed walk
//! is in [`super::typeorder`]. See that module for the tsrs differences.

use tsrs_ast::{Kind, Node, NodeFlags, NodeList};
use tsrs_checker::{
    Checker, Flags, InternalFlags, LiteralValue, Type, TypeFlags, TypeFormatFlags, new_node_builder_ex,
};
use tsrs_core::{P, jsnum};
use tsrs_printer::{PrintHandlers, PrinterOptions, new_emit_context, new_printer, new_text_writer};

use super::typeorder::{reorder_type_node, regular_type_of_literal_type};

/// typeToStringEx's cut-off with NoTruncation set.
const NO_TRUNCATION_MAX_LENGTH: usize = 1_000_000 * 2;

/// `checker.TypeToStringEx(t, nil, flags, nil)` with union members printed in
/// Strada's (type id) order.
pub fn type_to_string(c: &mut Checker, t: P<Type>, flags: TypeFormatFlags) -> String {
    type_to_string_at(c, t, None, flags)
}

/// `checker.TypeToStringEx(t, enclosing, flags, nil)` with union members and
/// mapped-type properties in Strada's order.
pub fn type_to_string_at(c: &mut Checker, t: P<Type>, enclosing: Option<P<Node>>, flags: TypeFormatFlags) -> String {
    let ec = new_emit_context();
    let nb = new_node_builder_ex(c, ec, None);
    let mut builder_flags = Flags::from_bits_retain((flags & TypeFormatFlags::NodeBuilderFlagsMask).bits()) | Flags::IgnoreErrors;
    let no_truncation = flags.intersects(TypeFormatFlags::NoTruncation);
    if no_truncation {
        builder_flags |= Flags::NoTruncation;
    }
    let node = nb
        .type_to_type_node(c, t, enclosing, builder_flags, InternalFlags::None, None)
        .expect("should always get typenode");
    reorder_type_node(c, Some(t), node);
    let new_line = if flags.intersects(TypeFormatFlags::MultilineObjectLiterals) { "\n" } else { "" };
    let mut writer = new_text_writer(new_line, 0);
    let mut p = new_printer(
        PrinterOptions { remove_comments: true, ..Default::default() },
        PrintHandlers::default(),
        Some(ec),
    );
    p.write(node, None, &mut *writer, None);
    let result = writer.string();
    let max_length = if no_truncation { NO_TRUNCATION_MAX_LENGTH } else { 160 * 2 };
    if !result.is_empty() && result.len() >= max_length {
        let mut cut = max_length - 3;
        while !result.is_char_boundary(cut) {
            cut -= 1;
        }
        return format!("{}...", &result[..cut]);
    }
    result
}

/// `checker.TypeToTypeNode` with union members in Strada's (type id) order.
pub fn type_to_type_node(c: &mut Checker, t: P<Type>, enclosing: Option<P<Node>>, flags: Flags) -> Option<P<Node>> {
    let nb = new_node_builder_ex(c, new_emit_context(), None);
    let node = nb.type_to_type_node(c, t, enclosing, flags, InternalFlags::None, None);
    if let Some(node) = node {
        reorder_type_node(c, Some(t), node);
    }
    node
}

/// Mutates a node list in place, as Go's `slices.SortStableFunc(nodes[:end], ...)`
/// does. The list's backing array is private to the node tree the node builder
/// just built for this call.
pub(super) fn sort_nodes_by_key<K: Ord>(nodes: &'static [P<Node>], key: impl Fn(P<Node>) -> K) {
    let mut sorted: Vec<P<Node>> = nodes.to_vec();
    sorted.sort_by_key(|n| key(*n));
    // The list is arena memory private to the node tree the node builder just
    // built for this call, written in place as Go's `slices.SortStableFunc`
    // does. The address goes through an integer and the stores are volatile so
    // the compiler cannot treat the `&[T]` the list was read through as
    // read-only memory and drop them (they were dropped in release builds).
    let addr = nodes.as_ptr() as usize;
    for (i, n) in sorted.into_iter().enumerate() {
        // SAFETY: `i` is in bounds of the list; nothing else reads it while we write.
        unsafe { std::ptr::write_volatile((addr as *mut P<Node>).add(i), n) };
    }
}

// ---- unionorder.go ----

/// Sorts, in place, the members of every synthesized union type node under
/// `node` by the id of the type each member denotes. Only unions whose members
/// are all literal or keyword types are touched: those are the members whose
/// type can be recovered from the node alone. Null and undefined keep their
/// place at the end, where formatUnionTypes puts them in both compilers. Nodes
/// taken from source text are left alone.
pub fn reorder_union_type_nodes(c: &mut Checker, node: P<Node>) {
    fn visit(c: &mut Checker, n: P<Node>) {
        if n.kind() == Kind::UnionType && n.flags().intersects(NodeFlags::Synthesized) {
            reorder_union(c, n.as_union_type_node().types());
        }
        n.for_each_child(&mut |child| {
            visit(c, child);
            false
        });
    }
    visit(c, node);
}

fn reorder_union(c: &mut Checker, list: P<NodeList>) {
    let nodes = list.nodes();
    // formatUnionTypes appends null and undefined after the rest.
    let mut end = nodes.len();
    while end > 0 && is_nullish(nodes[end - 1]) {
        end -= 1;
    }
    if end < 2 {
        return;
    }
    let mut keys: Vec<(P<Node>, u32)> = Vec::with_capacity(end);
    for &n in &nodes[..end] {
        let Some(t) = type_of_literal_or_keyword_node(c, n) else { return };
        keys.push((n, t.id().0));
    }
    sort_nodes_by_key(&nodes[..end], |m| keys.iter().find(|(k, _)| *k == m).map_or(0, |(_, id)| *id));
}

pub(super) fn is_nullish(n: P<Node>) -> bool {
    match n.kind() {
        Kind::UndefinedKeyword => true,
        Kind::LiteralType => n.as_literal_type_node().literal().kind() == Kind::NullKeyword,
        _ => false,
    }
}

/// getTypeFromTypeNode on a synthesized type node. tsrs walks up to the
/// enclosing statement (`getConditionalFlowTypeOfType`) and unwraps each
/// parent, so the node is parented to an empty statement for the call.
fn resolve_synthesized(c: &mut Checker, node: P<Node>) -> P<Type> {
    let stmt = new_emit_context().factory.new_empty_statement();
    let old = node.parent();
    node.set_parent(Some(stmt));
    let t = c.get_type_from_type_node_exported(node);
    node.set_parent(old);
    t
}

thread_local! {
    /// Number literal types seen while walking printed types, by value. tsrs'
    /// numeric-literal check needs the source text of the node (a synthesized
    /// node has none), so `getNumberLiteralType` cannot be reached by resolving
    /// a node; a printed literal's type was met on the way down instead.
    static NUMBERS: std::cell::RefCell<std::collections::HashMap<u64, P<Type>>> = Default::default();
}

pub(super) fn note_literal(t: P<Type>) {
    if t.flags().intersects(TypeFlags::NumberLiteral)
        && let Some(LiteralValue::Number(n)) = t.as_literal_type().value()
    {
        let regular = regular_type_of_literal_type(t);
        NUMBERS.with(|m| m.borrow_mut().insert(n.0.to_bits(), regular));
    }
}

fn number_literal_type(value: f64) -> Option<P<Type>> {
    NUMBERS.with(|m| m.borrow().get(&value.to_bits()).copied())
}

/// `getStringLiteralType` (pub(crate) in tsrs): the interned type, created if
/// absent, obtained by resolving a synthesized literal type node.
pub(super) fn string_literal_type(c: &mut Checker, value: &str) -> Option<P<Type>> {
    let factory = &new_emit_context().factory;
    thread_local! {
        static INTERNED: std::cell::RefCell<std::collections::HashSet<&'static str>> = Default::default();
    }
    let value: &'static str = INTERNED.with(|set| {
        let mut set = set.borrow_mut();
        match set.get(value) {
            Some(v) => v,
            None => {
                let v: &'static str = Box::leak(value.to_string().into_boxed_str());
                set.insert(v);
                v
            }
        }
    });
    let lit = factory.new_string_literal(value, Default::default());
    let node = factory.new_literal_type_node(lit);
    Some(resolve_synthesized(c, node))
}

/// The interned type a synthesized literal or keyword type node stands for, or
/// None for any other node.
pub(super) fn type_of_literal_or_keyword_node(c: &mut Checker, n: P<Node>) -> Option<P<Type>> {
    match n.kind() {
        Kind::StringKeyword => Some(c.get_string_type()),
        Kind::NumberKeyword => Some(c.get_number_type()),
        Kind::BigIntKeyword => Some(c.get_big_int_type()),
        Kind::SymbolKeyword => Some(c.get_es_symbol_type()),
        Kind::VoidKeyword => Some(c.get_void_type()),
        // `boolean` stands for false | true; the union holds it at false's place.
        Kind::BooleanKeyword => boolean_literal(c, false),
        Kind::LiteralType => {
            let lit = n.as_literal_type_node().literal();
            match lit.kind() {
                Kind::StringLiteral | Kind::NoSubstitutionTemplateLiteral => Some(resolve_synthesized(c, n)),
                Kind::NumericLiteral => number_literal_type(jsnum::from_string(lit.text()).0),
                Kind::PrefixUnaryExpression => {
                    let u = lit.as_prefix_unary_expression();
                    if u.operator == Kind::MinusToken && u.operand().kind() == Kind::NumericLiteral {
                        number_literal_type(-jsnum::from_string(u.operand().text()).0)
                    } else {
                        None
                    }
                }
                Kind::TrueKeyword => boolean_literal(c, true),
                Kind::FalseKeyword => boolean_literal(c, false),
                _ => None,
            }
        }
        _ => None,
    }
}

/// The regular true or false type: boolean's constituents, which typescript-go
/// keeps as [false, true].
fn boolean_literal(c: &mut Checker, value: bool) -> Option<P<Type>> {
    let members = c.get_boolean_type().types();
    if members.len() != 2 {
        return None;
    }
    Some(members[usize::from(value)])
}

