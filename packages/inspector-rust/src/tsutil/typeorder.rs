//! Port of Go `internal/tsutil/typeorder.go` and `unionorder.go`: printed types
//! in Strada's (old TypeScript's) order.
//!
//! Strada keeps a union's constituents sorted by type id (creation order) and
//! lays a mapped type's properties out in the order it iterates its key union;
//! typescript-go (and tsrs) sort unions by value. Printed types become schemas,
//! so the difference reaches `enum` and `required`. Literal and keyword types
//! are interned and ids are still allocated in creation order, so sorting a
//! printed union's members by the id of the type each came from gives Strada's
//! order back. See `packages/inspector-go/knowledge/decisions/
//! union-and-property-order-follow-type-ids.md`.
//!
//! Entry points: [`type_to_string`], [`type_to_string_at`], [`type_to_type_node`],
//! [`union_types_in_id_order`], [`reorder_type_node`].
//!
//! tsrs differences (also in PORTING.md): `Checker::get_string_literal_type`,
//! `get_number_literal_type`, `format_union_types`,
//! `get_modifiers_type_from_mapped_type` and `is_mapped_type_with_keyof_...` are
//! `pub(crate)`. Literal types are obtained through
//! `get_type_from_type_node_exported` on the synthesized literal node (which
//! interns the same type), `format_union_types` is re-implemented from public
//! pieces, and a homomorphic mapped type keeps its own (declaration) order
//! rather than being sorted by its modifiers type's order.

use tsrs_ast::{Kind, Node, NodeFlags, NodeList, SymbolFlags};
use tsrs_checker::{
    Checker, Flags, InternalFlags, LiteralValue, ObjectFlags, Type, TypeFlags, TypeFormatFlags, new_node_builder_ex,
};
use tsrs_core::{P, jsnum};
use tsrs_printer::{PrintHandlers, PrinterOptions, new_emit_context, new_printer, new_text_writer};

/// Bounds the type/node walk; printed types are trees, but a pathological one
/// should not be walked forever.
const MAX_REORDER_DEPTH: usize = 64;

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

/// Puts the unions and mapped-type members under `node`, which the node builder
/// printed from `t`, into Strada's order. It walks `t` and `node` together so
/// every union member and property signature is matched to the type it was
/// printed from; where the two cannot be matched up (a union printed from its
/// origin, a construct the walk does not follow), it falls back to
/// [`reorder_union_type_nodes`] for that subtree.
pub fn reorder_type_node(c: &mut Checker, t: Option<P<Type>>, node: P<Node>) {
    reorder_typed(c, t, Some(node), 0);
}

fn reorder_typed(c: &mut Checker, t: Option<P<Type>>, n: Option<P<Node>>, depth: usize) {
    let Some(n) = n else { return };
    let Some(t) = t.filter(|_| depth <= MAX_REORDER_DEPTH && n.flags().intersects(NodeFlags::Synthesized)) else {
        reorder_union_type_nodes(c, n);
        return;
    };
    let depth = depth + 1;
    note_literal(t);
    match n.kind() {
        Kind::ParenthesizedType => reorder_typed(c, Some(t), Some(n.type_node().unwrap()), depth),
        Kind::TypeOperator => reorder_typed(c, Some(t), Some(n.type_node().unwrap()), depth),
        Kind::ArrayType => {
            let mut elem = None;
            if c.is_array_type_exported(t) {
                elem = c.get_type_arguments_exported(t).first().copied();
            }
            reorder_typed(c, elem, Some(n.as_array_type_node().element_type()), depth);
        }
        Kind::TypeReference => {
            let nodes: &[P<Node>] = n.as_type_reference_node().type_arguments().map_or(&[], |l| l.nodes());
            let mut args: &[P<Type>] = &[];
            if let Some(alias) = t.alias().filter(|a| a.type_arguments().len() == nodes.len()) {
                args = alias.type_arguments();
            } else if t.flags().intersects(TypeFlags::Object) && t.object_flags().intersects(ObjectFlags::Reference) {
                args = c.get_type_arguments_exported(t);
            }
            for (i, arg) in nodes.iter().enumerate() {
                reorder_typed(c, args.get(i).copied(), Some(*arg), depth);
            }
        }
        Kind::IntersectionType => {
            let nodes = n.as_intersection_type_node().types().nodes();
            let mut types: Option<&[P<Type>]> = None;
            if t.flags().intersects(TypeFlags::Intersection) && t.types().len() == nodes.len() {
                types = Some(t.types());
            }
            for (i, m) in nodes.iter().enumerate() {
                reorder_typed(c, types.map(|ts| ts[i]), Some(*m), depth);
            }
        }
        Kind::UnionType => reorder_typed_union(c, t, n, depth),
        Kind::TypeLiteral => reorder_type_literal(c, t, n, depth),
        _ => reorder_union_type_nodes(c, n),
    }
}

/// Mutates a node list in place, as Go's `slices.SortStableFunc(nodes[:end], ...)`
/// does. The list's backing array is private to the node tree the node builder
/// just built for this call.
fn sort_nodes_by_key<K: Ord>(nodes: &'static [P<Node>], key: impl Fn(P<Node>) -> K) {
    let mut sorted: Vec<P<Node>> = nodes.to_vec();
    sorted.sort_by_key(|n| key(*n));
    // SAFETY: the list was allocated by the node builder for this printing and
    // is not shared with another thread or read while we write.
    unsafe {
        let dst = nodes.as_ptr() as *mut P<Node>;
        for (i, n) in sorted.into_iter().enumerate() {
            dst.add(i).write(n);
        }
    }
}

/// Pairs a union node's members with the constituents the node builder printed
/// them from (formatUnionTypes of t's types) and sorts them by those
/// constituents' ids. Null and undefined stay at the end.
fn reorder_typed_union(c: &mut Checker, t: P<Type>, n: P<Node>, depth: usize) {
    let nodes = n.as_union_type_node().types().nodes();
    let types: Vec<P<Type>> = if t.flags().intersects(TypeFlags::Union) {
        format_union_types(c, t.types(), false)
    } else {
        Vec::new()
    };
    types.iter().for_each(|t| note_literal(*t));
    let mut end = nodes.len();
    while end > 0 && is_nullish(nodes[end - 1]) {
        end -= 1;
    }
    let mut type_end = types.len();
    while type_end > 0 && types[type_end - 1].flags().intersects(TypeFlags::Nullable) {
        type_end -= 1;
    }
    if end != type_end || !union_members_match(c, &nodes[..end], &types[..type_end]) {
        // Printed from the union's origin, or otherwise not one-to-one.
        reorder_union_type_nodes(c, n);
        return;
    }
    let mut keys: Vec<(P<Node>, u32)> = Vec::with_capacity(end);
    for (i, m) in nodes[..end].iter().enumerate() {
        reorder_typed(c, Some(types[i]), Some(*m), depth);
        keys.push((*m, union_position(types[i])));
    }
    sort_nodes_by_key(&nodes[..end], |m| keys.iter().find(|(k, _)| *k == m).map_or(0, |(_, id)| *id));
}

/// `Checker.formatUnionTypes` (printer.go:253), which tsrs keeps `pub(crate)`.
fn format_union_types(c: &mut Checker, types: &[P<Type>], expanding_enum: bool) -> Vec<P<Type>> {
    let boolean = c.get_boolean_type();
    let mut result = Vec::new();
    let mut flags = TypeFlags::None;
    let mut i = 0;
    while i < types.len() {
        let t = types[i];
        flags |= t.flags();
        if !t.flags().intersects(TypeFlags::Nullable) {
            if t.flags().intersects(TypeFlags::BooleanLiteral)
                || (!expanding_enum && t.flags().intersects(TypeFlags::EnumLike))
            {
                let base_type = if t.flags().intersects(TypeFlags::BooleanLiteral) {
                    boolean
                } else {
                    base_type_of_enum_like_type(c, t)
                };
                if base_type.flags().intersects(TypeFlags::Union) {
                    let base_types = base_type.types();
                    let count = base_types.len();
                    if i + count <= types.len()
                        && regular_type_of_literal_type(types[i + count - 1])
                            == regular_type_of_literal_type(base_types[count - 1])
                    {
                        result.push(base_type);
                        i += count;
                        continue;
                    }
                }
            }
            result.push(t);
        }
        i += 1;
    }
    if flags.intersects(TypeFlags::Null) {
        result.push(c.get_null_type());
    }
    if flags.intersects(TypeFlags::Undefined) {
        result.push(c.get_undefined_type());
    }
    result
}

/// `getBaseTypeOfEnumLikeType`.
fn base_type_of_enum_like_type(c: &mut Checker, t: P<Type>) -> P<Type> {
    if t.flags().intersects(TypeFlags::EnumLike)
        && let Some(sym) = t.symbol()
        && c.get_symbol_flags_exported(sym).intersects(SymbolFlags::EnumMember)
        && let Some(parent) = c.get_parent_of_symbol_exported(sym)
    {
        return c.get_declared_type_of_symbol_exported(parent);
    }
    t
}

/// `getRegularTypeOfLiteralType` for the literal types a union holds.
fn regular_type_of_literal_type(t: P<Type>) -> P<Type> {
    if t.flags().intersects(TypeFlags::Literal) {
        if let Some(r) = t.as_literal_type().regular_type() {
            return r;
        }
    }
    t
}

/// `UnionTypesInIdOrder`: t's constituents in Strada's order, by type id;
/// typescript-go keeps them sorted by value.
pub fn union_types_in_id_order(t: P<Type>) -> Vec<P<Type>> {
    let mut types = t.types().to_vec();
    types.sort_by_key(|x| x.id().0);
    types
}

/// The id Strada sorts a printed union member by. A member formatUnionTypes
/// collapsed (boolean, an enum) stands where its first constituent stood.
fn union_position(t: P<Type>) -> u32 {
    if t.flags().intersects(TypeFlags::Union) && !t.types().is_empty() {
        return t.types()[0].id().0;
    }
    t.id().0
}

/// Checks that each node could have been printed from the type at the same
/// position: literals and keywords must be that very type and references must
/// name it. Anything else is taken on trust.
fn union_members_match(c: &mut Checker, nodes: &[P<Node>], types: &[P<Type>]) -> bool {
    for (n, &t) in nodes.iter().zip(types) {
        if n.kind() == Kind::BooleanKeyword {
            if t != c.get_boolean_type() {
                return false;
            }
            continue;
        }
        if let Some(want) = type_of_literal_or_keyword_node(c, *n) {
            let got = if t.flags().intersects(TypeFlags::Literal) { regular_type_of_literal_type(t) } else { t };
            if got != want {
                return false;
            }
            continue;
        }
        if n.kind() == Kind::TypeReference && !reference_names(*n, t) {
            return false;
        }
    }
    true
}

fn reference_names(n: P<Node>, t: P<Type>) -> bool {
    let mut name = n.as_type_reference_node().type_name();
    if name.kind() == Kind::QualifiedName {
        name = name.as_qualified_name().right();
    }
    let text = name.text();
    if let Some(alias) = t.alias()
        && let Some(sym) = alias.symbol()
        && sym.name() == text
    {
        return true;
    }
    t.symbol().is_some_and(|s| s.name() == text)
}

/// Walks each property signature with its property's type and then sorts the
/// signatures into Strada's property order.
fn reorder_type_literal(c: &mut Checker, t: P<Type>, n: P<Node>, depth: usize) {
    let members = n.as_type_literal_node().members().nodes();
    let is_object = t.flags().intersects(TypeFlags::Object | TypeFlags::Intersection);
    for &m in members {
        let mut mt = None;
        if is_object && m.kind() == Kind::PropertySignature {
            let name = member_name(m);
            if !name.is_empty()
                && let Some(prop) = c.get_property_of_type_exported(t, &name)
            {
                mt = Some(c.get_type_of_symbol_exported(prop));
            }
        }
        if m.kind() == Kind::PropertySignature {
            reorder_typed(c, mt, m.type_node(), depth);
        } else {
            reorder_union_type_nodes(c, m);
        }
    }
    if !is_object {
        return;
    }
    let mut rank: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for (i, name) in property_order(c, t, 0).into_iter().enumerate() {
        rank.entry(name).or_insert(i);
    }
    let len = rank.len();
    sort_nodes_by_key(members, |m| match rank.get(&member_name(m)) {
        Some(&r) if m.kind() == Kind::PropertySignature => r,
        _ => len,
    });
}

fn member_name(m: P<Node>) -> String {
    let Some(name) = m.name() else { return String::new() };
    match name.kind() {
        Kind::Identifier | Kind::StringLiteral | Kind::NumericLiteral | Kind::NoSubstitutionTemplateLiteral => {
            name.text().to_string()
        }
        _ => String::new(),
    }
}

fn is_mapped(t: P<Type>) -> bool {
    t.flags().intersects(TypeFlags::Object) && t.object_flags().intersects(ObjectFlags::Mapped)
}

/// `isMappedTypeWithKeyofConstraintDeclaration`, from the mapped type node: the
/// type's symbol's first declaration is its MappedType node.
fn is_mapped_type_with_keyof_constraint_declaration(t: P<Type>) -> bool {
    let Some(decl) = t.symbol().and_then(|s| s.declarations().first().copied()) else { return false };
    if decl.kind() != Kind::MappedType {
        return false;
    }
    let Some(constraint) = decl.as_mapped_type_node().type_parameter().as_type_parameter_declaration().constraint() else {
        return false;
    };
    constraint.kind() == Kind::TypeOperator && constraint.as_type_operator_node().operator == Kind::KeyOfKeyword
}

/// The order Strada lays out t's properties in.
///   - A homomorphic mapped type (`{ [K in keyof T]: X }`) iterates T's
///     properties, so it keeps T's order. (tsrs: the modifiers type is not
///     reachable, so the type's own order stands; see PORTING.md.)
///   - Any other mapped type iterates its key union, which Strada keeps in id
///     order and typescript-go in value order; the keys are string literals,
///     interned, so their ids give back Strada's order.
///   - An intersection lists its constituents' properties in turn.
///   - A widened object literal lists its own properties, then the ones it
///     gained as `?: undefined` from the other literals in its union;
///     typescript-go sorts them all by declaration position.
///   - Every other object type keeps declaration order in both compilers.
fn property_order(c: &mut Checker, t: P<Type>, depth: usize) -> Vec<String> {
    let props = c.get_properties_of_type_exported(t);
    let mut names: Vec<String> = props.iter().map(|p| p.name().to_string()).collect();
    if depth > MAX_REORDER_DEPTH {
        return names;
    }
    if is_mapped(t) && is_mapped_type_with_keyof_constraint_declaration(t) {
        return names;
    }
    if is_mapped(t) {
        let mut keys: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
        for name in &names {
            let id = string_literal_type(c, name).map_or(0, |t| t.id().0);
            keys.insert(name.clone(), id);
        }
        names.sort_by_key(|n| keys[n]);
        return names;
    }
    if t.flags().intersects(TypeFlags::Intersection) {
        let mut order = Vec::new();
        for &m in t.types() {
            order.extend(property_order(c, m, depth + 1));
        }
        return order_by(names, &order);
    }
    if let Some(literal) = object_literal_declaration(t) {
        let (own, gained): (Vec<&P<tsrs_ast::Symbol>>, Vec<&P<tsrs_ast::Symbol>>) =
            props.iter().partition(|p| p.declarations().iter().any(|d| d.parent() == Some(literal)));
        return own.into_iter().chain(gained).map(|p| p.name().to_string()).collect();
    }
    names
}

fn object_literal_declaration(t: P<Type>) -> Option<P<Node>> {
    if !t.flags().intersects(TypeFlags::Object) {
        return None;
    }
    t.symbol()?.declarations().iter().copied().find(|d| d.kind() == Kind::ObjectLiteralExpression)
}

/// Sorts names by their first position in order; names order does not mention
/// keep their place after the rest.
fn order_by(mut names: Vec<String>, order: &[String]) -> Vec<String> {
    let mut rank: std::collections::HashMap<&str, usize> = std::collections::HashMap::new();
    for (i, name) in order.iter().enumerate() {
        rank.entry(name.as_str()).or_insert(i);
    }
    names.sort_by_key(|n| rank.get(n.as_str()).copied().unwrap_or(order.len()));
    names
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

fn is_nullish(n: P<Node>) -> bool {
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

fn note_literal(t: P<Type>) {
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
fn string_literal_type(c: &mut Checker, value: &str) -> Option<P<Type>> {
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
fn type_of_literal_or_keyword_node(c: &mut Checker, n: P<Node>) -> Option<P<Type>> {
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
