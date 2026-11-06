//! Port of Go `internal/tsjg/types` (types.go, typeutils.go, numbers.go): the
//! intermediate type model node parsers produce and type formatters consume.
//!
//! A [`Ty`] is a shared, immutable node; the one mutable thing is
//! [`ReferenceType`], which is completed after creation to break cycles. Go
//! compares types by pointer in several maps: use [`ty_key`] for that.

use std::cell::RefCell;
use std::rc::Rc;

use serde_json::{Map, Value};

use super::fail;

/// A type; Go's nil `Type` is `Option<Ty>`.
pub type Ty = Rc<TypeKind>;
/// Go `LiteralValue` / `EnumValue`: a JSON scalar (string, number from an f64, bool, null).
pub type LiteralValue = Value;
/// Go `Annotations` (`map[string]any`); output order is decided at marshal time.
pub type Annotations = Map<String, Value>;

#[derive(Debug)]
pub enum TypeKind {
    Any,
    Unknown { errored_source: bool },
    String { preserve_literals: bool },
    Number,
    Boolean,
    Null,
    Symbol,
    Undefined,
    Void,
    Never,
    Hidden,
    Literal(LiteralType),
    Enum(EnumType),
    Object(ObjectType),
    Union(UnionType),
    Intersection(IntersectionType),
    Array(ArrayType),
    Tuple(TupleType),
    Optional(OptionalType),
    Rest(RestType),
    Infer(InferType),
    Alias(AliasType),
    Annotated(AnnotatedType),
    Definition(DefinitionType),
    Reference(ReferenceType),
    Function(FunctionType),
    Constructor(ConstructorType),
}

/// Identity key of a type for pointer-keyed maps (Go map[types.Type]).
pub fn ty_key(t: &Ty) -> usize {
    Rc::as_ptr(t) as *const () as usize
}

#[derive(Debug)]
pub struct LiteralType {
    pub value: LiteralValue,
}

impl LiteralType {
    pub fn is_string(&self) -> bool {
        self.value.is_string()
    }
}

#[derive(Debug)]
pub struct EnumType {
    pub id: String,
    pub values: Vec<EnumValue>,
    pub types: Vec<Ty>,
}
pub type EnumValue = Value;

pub fn new_enum_type(id: String, values: Vec<EnumValue>) -> Ty {
    let types = values
        .iter()
        .map(|v| if v.is_null() { new(TypeKind::Null) } else { new(TypeKind::Literal(LiteralType { value: v.clone() })) })
        .collect();
    new(TypeKind::Enum(EnumType { id, values, types }))
}

#[derive(Debug)]
pub struct ObjectProperty {
    name: String,
    pub ty: Ty,
    pub required: bool,
}

impl ObjectProperty {
    pub fn new(name: String, ty: Ty, required: bool) -> ObjectProperty {
        ObjectProperty { name, ty, required }
    }
    /// The property name with surrounding quotes stripped.
    pub fn name(&self) -> String {
        strip_quotes(&self.name)
    }
}

/// `BaseType | boolean`.
#[derive(Debug, Clone)]
pub enum AdditionalProperties {
    Bool(bool),
    Type(Ty),
}

#[derive(Debug)]
pub struct ObjectType {
    pub id: String,
    pub base_types: Vec<Ty>,
    pub properties: Vec<ObjectProperty>,
    /// None is Go's nil.
    pub additional_properties: Option<AdditionalProperties>,
    pub non_primitive: bool,
}

pub fn new_object_type(
    id: String,
    base_types: Vec<Ty>,
    properties: Vec<ObjectProperty>,
    additional_properties: Option<AdditionalProperties>,
    non_primitive: bool,
) -> Ty {
    new(TypeKind::Object(ObjectType { id, base_types, properties, additional_properties, non_primitive }))
}

#[derive(Debug)]
pub struct UnionType {
    types: Vec<Ty>,
    /// Set by the @discriminator annotation, mutated after construction in Go.
    pub discriminator: RefCell<String>,
}

/// Flattens nested unions, drops never-like members, de-duplicates by ID.
pub fn new_union_type(member_types: &[Ty]) -> Ty {
    new(TypeKind::Union(make_union(member_types)))
}

fn make_union(member_types: &[Ty]) -> UnionType {
    let mut flat = Vec::new();
    for t in member_types {
        if let TypeKind::Union(u) = &**t {
            flat.extend(u.types.iter().cloned());
        } else if !is_never_like(t) {
            flat.push(t.clone());
        }
    }
    UnionType { types: unique_types(&flat), discriminator: RefCell::new(String::new()) }
}

impl UnionType {
    pub fn types(&self) -> &[Ty] {
        &self.types
    }

    /// Simplifies unions of zero or one entries.
    pub fn normalize(&self) -> Ty {
        if self.types.is_empty() {
            return new(TypeKind::Never);
        }
        if self.types.len() == 1 {
            return self.types[0].clone();
        }
        let kept: Vec<Ty> = self.types.iter().filter(|m| !matches!(&*deref_type(m), TypeKind::Never)).cloned().collect();
        let union = make_union(&kept);
        if union.types.len() > 1 {
            return new(TypeKind::Union(union));
        }
        union.normalize()
    }

    /// The members as a flat list, dereferenced with `deref` (`deref_aliased_type`
    /// when None), skipping hidden types.
    pub fn flattened_types(&self, deref: Option<&dyn Fn(&Ty) -> Ty>) -> Vec<Ty> {
        let mut out = Vec::new();
        for m in &self.types {
            if is_hidden_type(m) {
                continue;
            }
            let d = match deref {
                Some(f) => f(m),
                None => deref_aliased_type(m),
            };
            if let TypeKind::Union(u) = &*d {
                out.extend(u.flattened_types(deref));
            } else {
                out.push(d);
            }
        }
        out
    }
}

#[derive(Debug)]
pub struct IntersectionType {
    types: Vec<Ty>,
}

impl IntersectionType {
    pub fn types(&self) -> &[Ty] {
        &self.types
    }
}

pub fn new_intersection_type(member_types: Vec<Ty>) -> Ty {
    new(TypeKind::Intersection(IntersectionType { types: member_types }))
}

#[derive(Debug)]
pub struct ArrayType {
    pub item: Ty,
}

#[derive(Debug)]
pub struct TupleType {
    types: Vec<Ty>,
}

impl TupleType {
    pub fn types(&self) -> &[Ty] {
        &self.types
    }
}

/// Normalizes rest-of-tuple entries by inlining them.
pub fn new_tuple_type(member_types: &[Ty]) -> Ty {
    new(TypeKind::Tuple(TupleType { types: normalize_tuple_members(member_types) }))
}

fn normalize_tuple_members(member_types: &[Ty]) -> Vec<Ty> {
    let mut normalized = Vec::new();
    for t in member_types {
        if let TypeKind::Rest(rest) = &**t {
            if let TypeKind::Tuple(inner) = &*deref_type(&rest.ty) {
                normalized.extend(normalize_tuple_members(&inner.types));
                continue;
            }
        }
        normalized.push(t.clone());
    }
    normalized
}

#[derive(Debug)]
pub struct OptionalType {
    pub ty: Ty,
}

#[derive(Debug)]
pub struct RestType {
    pub ty: Ty,
    pub title: String,
}

#[derive(Debug)]
pub struct InferType {
    pub id: String,
}

#[derive(Debug)]
pub struct AliasType {
    pub id: String,
    pub ty: Ty,
}

#[derive(Debug)]
pub struct AnnotatedType {
    pub ty: Ty,
    pub annotations: Annotations,
    pub nullable: bool,
}

#[derive(Debug)]
pub struct DefinitionType {
    name: String,
    pub ty: Ty,
}

#[derive(Debug, Default)]
pub struct ReferenceType {
    inner: RefCell<RefInner>,
}

#[derive(Debug, Default)]
struct RefInner {
    ty: Option<Ty>,
    id: String,
    name: String,
}

impl ReferenceType {
    pub fn set_id(&self, id: String) {
        self.inner.borrow_mut().id = id;
    }
    pub fn set_name(&self, name: String) {
        self.inner.borrow_mut().name = name;
    }
    pub fn has_type(&self) -> bool {
        self.inner.borrow().ty.is_some()
    }
    pub fn ty(&self) -> Ty {
        match &self.inner.borrow().ty {
            Some(t) => t.clone(),
            None => fail("reference type not set yet"),
        }
    }
    pub fn set_type(&self, t: Ty) {
        let id = t.id();
        let name = t.name();
        let mut i = self.inner.borrow_mut();
        i.ty = Some(t);
        i.id = id;
        i.name = name;
    }
}

/// Go `types.NewReferenceType`: created empty while a circular node is parsed,
/// completed with [`ReferenceType::set_type`].
pub fn new_reference_type() -> Rc<TypeKind> {
    new(TypeKind::Reference(ReferenceType::default()))
}

#[derive(Debug)]
pub struct FunctionType {
    pub comment: String,
    /// An Object type, or an Infer type; None (Go nil) for parameterless signatures.
    pub named_arguments: Option<Ty>,
    /// None (Go nil) when the signature has no return type annotation.
    pub return_type: Option<Ty>,
}

#[derive(Debug)]
pub struct ConstructorType {
    pub comment: String,
    pub named_arguments: Option<Ty>,
}

pub fn new(k: TypeKind) -> Ty {
    Rc::new(k)
}

impl TypeKind {
    pub fn id(&self) -> String {
        match self {
            TypeKind::Any => "any".into(),
            TypeKind::Unknown { .. } => "unknown".into(),
            TypeKind::String { .. } => "string".into(),
            TypeKind::Number => "number".into(),
            TypeKind::Boolean => "boolean".into(),
            TypeKind::Null => "null".into(),
            TypeKind::Symbol => "symbol".into(),
            TypeKind::Undefined => "undefined".into(),
            TypeKind::Void => "void".into(),
            TypeKind::Never => "never".into(),
            TypeKind::Hidden => "hidden".into(),
            TypeKind::Literal(l) => stable_stringify(&l.value),
            TypeKind::Enum(e) => e.id.clone(),
            TypeKind::Object(o) => o.id.clone(),
            TypeKind::Union(u) => format!("({})", u.types.iter().map(|m| m.id()).collect::<Vec<_>>().join("|")),
            TypeKind::Intersection(u) => format!("({})", u.types.iter().map(|m| m.id()).collect::<Vec<_>>().join("&")),
            TypeKind::Array(a) => format!("{}[]", a.item.id()),
            TypeKind::Tuple(t) => format!("[{}]", t.types.iter().map(|m| m.id()).collect::<Vec<_>>().join(",")),
            TypeKind::Optional(o) => format!("{}?", o.ty.id()),
            TypeKind::Rest(r) => format!("...{}{}", r.ty.id(), r.title),
            TypeKind::Infer(i) => i.id.clone(),
            TypeKind::Alias(a) => a.id.clone(),
            TypeKind::Annotated(a) => {
                let mut arr = vec![Value::Bool(a.nullable), Value::Object(a.annotations.clone())];
                format!("{}{}", a.ty.id(), hash(&Value::Array(std::mem::take(&mut arr))))
            }
            TypeKind::Definition(d) => format!("def-{}", d.ty.id()),
            TypeKind::Reference(r) => {
                let i = r.inner.borrow();
                if i.id.is_empty() {
                    fail("reference type ID not set yet")
                }
                i.id.clone()
            }
            TypeKind::Function(_) => "function".into(),
            TypeKind::Constructor(_) => "constructor".into(),
        }
    }

    pub fn name(&self) -> String {
        match self {
            TypeKind::Union(u) => format!("({})", u.types.iter().map(|m| m.name()).collect::<Vec<_>>().join("|")),
            TypeKind::Definition(d) => {
                if d.name.is_empty() {
                    self.id()
                } else {
                    d.name.clone()
                }
            }
            TypeKind::Reference(r) => {
                let i = r.inner.borrow();
                if i.name.is_empty() {
                    fail("reference type name not set yet")
                }
                i.name.clone()
            }
            _ => self.id(),
        }
    }
}

/// Go `NewDefinitionType`.
pub fn new_definition_type(name: String, ty: Ty) -> Ty {
    new(TypeKind::Definition(DefinitionType { name, ty }))
}

pub fn is_primitive(t: &Ty) -> bool {
    matches!(&**t, TypeKind::String { .. } | TypeKind::Number | TypeKind::Boolean | TypeKind::Null | TypeKind::Symbol)
}

pub fn is_never_like(t: &Ty) -> bool {
    matches!(&**t, TypeKind::Never | TypeKind::Hidden)
}

/// Dereferences definition, alias, annotated and resolved reference wrappers.
pub fn deref_type(t: &Ty) -> Ty {
    match &**t {
        TypeKind::Definition(w) => deref_type(&w.ty),
        TypeKind::Alias(w) => deref_type(&w.ty),
        TypeKind::Annotated(w) => deref_type(&w.ty),
        TypeKind::Reference(w) if w.has_type() => deref_type(&w.ty()),
        _ => t.clone(),
    }
}

/// Dereferences annotated and alias wrappers.
pub fn deref_annotated_type(t: &Ty) -> Ty {
    match &**t {
        TypeKind::Annotated(w) => deref_annotated_type(&w.ty),
        TypeKind::Alias(w) => deref_annotated_type(&w.ty),
        _ => t.clone(),
    }
}

/// Dereferences alias wrappers only.
pub fn deref_aliased_type(t: &Ty) -> Ty {
    match &**t {
        TypeKind::Alias(a) => deref_aliased_type(&a.ty),
        _ => t.clone(),
    }
}

/// Whether `t` is (or wraps) a hidden or never type.
pub fn is_hidden_type(t: &Ty) -> bool {
    match &**t {
        TypeKind::Hidden | TypeKind::Never => true,
        TypeKind::Definition(w) => is_hidden_type(&w.ty),
        TypeKind::Alias(w) => is_hidden_type(&w.ty),
        TypeKind::Annotated(w) => is_hidden_type(&w.ty),
        _ => false,
    }
}

pub fn is_deep_literal_union(t: &Ty) -> bool {
    match &*deref_type(t) {
        TypeKind::Literal(_) => true,
        TypeKind::Union(u) => u.types().iter().all(is_deep_literal_union),
        _ => false,
    }
}

/// De-duplicates by type ID, keeping first occurrences in order.
pub fn unique_types(list: &[Ty]) -> Vec<Ty> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::with_capacity(list.len());
    for t in list {
        if seen.insert(t.id()) {
            out.push(t.clone());
        }
    }
    out
}

/// Removes surrounding single or double quotes (src/Utils/String.ts).
pub fn strip_quotes(s: &str) -> String {
    let b = s.as_bytes();
    if b.len() > 1 && ((b[0] == b'"' && b[b.len() - 1] == b'"') || (b[0] == b'\'' && b[b.len() - 1] == b'\'')) {
        let inner = &s[1..s.len() - 1];
        if !inner.contains(['\'', '"']) {
            return inner.to_string();
        }
    }
    s.to_string()
}

// ---------------------------------------------------------------------------
// Stable stringify + hash (src/Utils/nodeKey.ts)

/// Go `NumberToString`: JavaScript `Number#toString`.
pub fn number_to_string(f: f64) -> String {
    if f == f64::INFINITY {
        "Infinity".into()
    } else if f == f64::NEG_INFINITY {
        "-Infinity".into()
    } else if f.is_nan() {
        "NaN".into()
    } else {
        crate::jsjson::format_number(f)
    }
}

/// JSON with sorted object keys (safe-stable-stringify).
pub fn stable_stringify(v: &Value) -> String {
    let mut s = String::new();
    write_stable(&mut s, v);
    s
}

fn write_stable(sb: &mut String, v: &Value) {
    match v {
        Value::Null => sb.push_str("null"),
        Value::String(x) => quote_json_string(sb, x),
        Value::Bool(b) => sb.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => {
            let f = n.as_f64().unwrap_or(0.0);
            if f.is_finite() {
                sb.push_str(&number_to_string(f));
            } else {
                sb.push_str("null");
            }
        }
        Value::Array(a) => {
            sb.push('[');
            for (i, e) in a.iter().enumerate() {
                if i > 0 {
                    sb.push(',');
                }
                write_stable(sb, e);
            }
            sb.push(']');
        }
        Value::Object(m) => {
            let mut keys: Vec<&String> = m.keys().collect();
            keys.sort();
            sb.push('{');
            for (i, k) in keys.iter().enumerate() {
                if i > 0 {
                    sb.push(',');
                }
                quote_json_string(sb, k);
                sb.push(':');
                write_stable(sb, &m[*k]);
            }
            sb.push('}');
        }
    }
}

fn quote_json_string(sb: &mut String, s: &str) {
    sb.push('"');
    for r in s.chars() {
        match r {
            '"' => sb.push_str("\\\""),
            '\\' => sb.push_str("\\\\"),
            '\n' => sb.push_str("\\n"),
            '\r' => sb.push_str("\\r"),
            '\t' => sb.push_str("\\t"),
            c if (c as u32) < 0x20 => sb.push_str(&format!("\\u{:04x}", c as u32)),
            c => sb.push(c),
        }
    }
    sb.push('"');
}

/// Hashes a value like src/Utils/nodeKey.ts: short strings pass through,
/// longer ones use the Java string hash, numbers stringify as themselves.
pub fn hash(v: &Value) -> String {
    if let Value::Number(n) = v {
        return number_to_string(n.as_f64().unwrap_or(0.0));
    }
    let owned;
    let s: &str = match v {
        Value::String(s) => s,
        _ => {
            owned = stable_stringify(v);
            &owned
        }
    };
    hash_str(s)
}

pub fn hash_str(s: &str) -> String {
    let units: Vec<u16> = s.encode_utf16().collect();
    if units.len() < 20 {
        return s.to_string();
    }
    let mut h: i32 = 0;
    for c in units {
        h = h.wrapping_shl(5).wrapping_sub(h).wrapping_add(c as i32);
    }
    (h as i64).abs().to_string()
}

// ---------------------------------------------------------------------------
// typeutils.go

pub fn not_never(t: &Ty) -> bool {
    !is_never_like(t)
}

/// Wraps `new_type` with `original`'s annotations if the original was annotated.
pub fn preserve_annotation(original: &Ty, new_type: Ty) -> Ty {
    match &**original {
        TypeKind::Annotated(a) => new(TypeKind::Annotated(AnnotatedType {
            ty: new_type,
            annotations: a.annotations.clone(),
            nullable: a.nullable,
        })),
        _ => new_type,
    }
}

/// Removes undefined members from a union: (how many removed, resulting type).
pub fn remove_undefined(property_type: &UnionType) -> (usize, Ty) {
    let mut kept = Vec::new();
    let mut num_removed = 0;
    for t in property_type.types() {
        let derefed = deref_annotated_type(t);
        match &*derefed {
            TypeKind::Undefined => num_removed += 1,
            TypeKind::Union(d) => {
                let (removed, sub) = remove_undefined(d);
                num_removed += removed;
                kept.push(preserve_annotation(t, sub));
            }
            _ => kept.push(t.clone()),
        }
    }
    let ty = match kept.len() {
        0 => new(TypeKind::Undefined),
        1 => kept.remove(0),
        _ => new_union_type(&kept),
    };
    (num_removed, ty)
}

/// Collects the string forms of all literals in a type; fails on non-literal types.
pub fn extract_literals(t: &Ty) -> Vec<String> {
    let mut out = Vec::new();
    extract(t, &mut out);
    out
}

fn extract(t: &Ty, out: &mut Vec<String>) {
    let d = deref_annotated_type(t);
    match &*d {
        TypeKind::Literal(l) => out.push(js_value_to_string(&l.value)),
        TypeKind::Union(u) => u.types().iter().for_each(|m| extract(m, out)),
        TypeKind::Enum(e) => e.types.iter().for_each(|m| extract(m, out)),
        TypeKind::Alias(a) => extract(&a.ty, out),
        TypeKind::Definition(a) => extract(&a.ty, out),
        TypeKind::Boolean => {
            out.push("true".into());
            out.push("false".into());
        }
        other => fail(&format!("unknown type {} while extracting literals", go_type_name(other))),
    }
}

/// `%T` of the Go struct, for error messages.
pub fn go_type_name(k: &TypeKind) -> &'static str {
    match k {
        TypeKind::Any => "*types.AnyType",
        TypeKind::Unknown { .. } => "*types.UnknownType",
        TypeKind::String { .. } => "*types.StringType",
        TypeKind::Number => "*types.NumberType",
        TypeKind::Boolean => "*types.BooleanType",
        TypeKind::Null => "*types.NullType",
        TypeKind::Symbol => "*types.SymbolType",
        TypeKind::Undefined => "*types.UndefinedType",
        TypeKind::Void => "*types.VoidType",
        TypeKind::Never => "*types.NeverType",
        TypeKind::Hidden => "*types.HiddenType",
        TypeKind::Literal(_) => "*types.LiteralType",
        TypeKind::Enum(_) => "*types.EnumType",
        TypeKind::Object(_) => "*types.ObjectType",
        TypeKind::Union(_) => "*types.UnionType",
        TypeKind::Intersection(_) => "*types.IntersectionType",
        TypeKind::Array(_) => "*types.ArrayType",
        TypeKind::Tuple(_) => "*types.TupleType",
        TypeKind::Optional(_) => "*types.OptionalType",
        TypeKind::Rest(_) => "*types.RestType",
        TypeKind::Infer(_) => "*types.InferType",
        TypeKind::Alias(_) => "*types.AliasType",
        TypeKind::Annotated(_) => "*types.AnnotatedType",
        TypeKind::Definition(_) => "*types.DefinitionType",
        TypeKind::Reference(_) => "*types.ReferenceType",
        TypeKind::Function(_) => "*types.FunctionType",
        TypeKind::Constructor(_) => "*types.ConstructorType",
    }
}

/// JavaScript `String(value)` for JSON scalars.
pub fn js_value_to_string(v: &Value) -> String {
    match v {
        Value::Null => "null".into(),
        Value::String(s) => s.clone(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => number_to_string(n.as_f64().unwrap_or(0.0)),
        other => other.to_string(),
    }
}

/// Whether every flattened member of the union is a literal, null, string or enum.
pub fn is_literal_union(t: &UnionType) -> bool {
    t.flattened_types(None)
        .iter()
        .all(|i| matches!(&**i, TypeKind::Literal(_) | TypeKind::Null | TypeKind::String { .. } | TypeKind::Enum(_)))
}

fn deref_and_flatten_unions(t: &Ty) -> Vec<Ty> {
    if let TypeKind::Union(u) = &*deref_type(t) {
        return u.types().iter().flat_map(deref_and_flatten_unions).collect();
    }
    vec![t.clone()]
}

/// Distributes an intersection over unions: `A & (B | C)` becomes `(A & B) | (A & C)`.
pub fn translate(member_types: &[Ty]) -> Ty {
    let member_types = unique_types(member_types);
    if member_types.len() == 1 {
        return member_types[0].clone();
    }
    let unions: Vec<Vec<Ty>> = member_types.iter().map(deref_and_flatten_unions).collect();
    let mut result = Vec::new();
    process(&unions, 0, &[], &mut result);
    match result.len() {
        0 => fail("could not translate intersection to union"),
        1 => result.remove(0),
        _ => new_union_type(&result),
    }
}

fn process(unions: &[Vec<Ty>], i: usize, current: &[Ty], result: &mut Vec<Ty>) {
    for t in &unions[i] {
        let mut combination = current.to_vec();
        combination.push(t.clone());
        if i < unions.len() - 1 {
            process(unions, i + 1, &combination, result);
            continue;
        }
        let combination = unique_types(&combination);
        let has_undefined = combination.iter().any(|c| matches!(&**c, TypeKind::Undefined));
        let primitives: Vec<&Ty> = combination.iter().filter(|c| is_primitive(c)).collect();
        if has_undefined {
            result.push(new(TypeKind::Undefined));
        } else if primitives.len() == 1 {
            result.push(primitives[0].clone());
        } else if primitives.len() > 1 {
            // conflicting primitives -> drop the combination
        } else if combination.len() == 1 {
            result.push(combination[0].clone());
        } else {
            result.push(new_intersection_type(combination));
        }
    }
}

/// The literal keys of a type (src/Utils/typeKeys.ts); each is a Literal type.
pub fn get_type_keys(t: &Ty) -> Vec<Ty> {
    match &*deref_type(t) {
        TypeKind::Intersection(d) => composite_keys(d.types()),
        TypeKind::Union(d) => composite_keys(d.types()),
        TypeKind::Tuple(d) => (0..d.types().len())
            .map(|i| new(TypeKind::Literal(LiteralType { value: Value::from(i as f64) })))
            .collect(),
        TypeKind::Object(d) => {
            let mut keys: Vec<Ty> = d
                .properties
                .iter()
                .map(|p| new(TypeKind::Literal(LiteralType { value: Value::String(p.name()) })))
                .collect();
            for parent in &d.base_types {
                keys.extend(get_type_keys(parent));
            }
            unique_types(&keys)
        }
        _ => Vec::new(),
    }
}

fn composite_keys(member_types: &[Ty]) -> Vec<Ty> {
    let keys: Vec<Ty> = member_types.iter().flat_map(get_type_keys).collect();
    unique_types(&keys)
}

/// The type of the property named by `index` (a Literal, String or Number type).
pub fn get_type_by_key(t: &Ty, index: &Ty) -> Option<Ty> {
    let d = deref_type(t);
    match &*d {
        TypeKind::Intersection(c) => composite_by_key(&d, c.types(), index),
        TypeKind::Union(c) => composite_by_key(&d, c.types(), index),
        TypeKind::Tuple(c) => {
            if let TypeKind::Literal(lit) = &**index {
                if let Some(idx) = lit.value.as_f64() {
                    let i = idx as i64;
                    if i >= 0 && (i as usize) < c.types().len() {
                        return Some(c.types()[i as usize].clone());
                    }
                }
            }
            None
        }
        TypeKind::Array(c) => matches!(&**index, TypeKind::Number).then(|| c.item.clone()),
        TypeKind::Object(o) => {
            if let TypeKind::Literal(lit) = &**index {
                if let Some(name) = lit.value.as_str() {
                    for p in &o.properties {
                        if p.name() != name {
                            continue;
                        }
                        let mut new_prop = deref_annotated_type(&p.ty);
                        if !p.required {
                            new_prop = optional_property_type(&new_prop);
                        }
                        return Some(preserve_annotation(&p.ty, new_prop));
                    }
                }
            }
            for sub in &o.base_types {
                if let Some(k) = get_type_by_key(sub, index) {
                    return Some(k);
                }
            }
            match &o.additional_properties {
                Some(AdditionalProperties::Type(t)) => Some(t.clone()),
                Some(AdditionalProperties::Bool(true)) => Some(new(TypeKind::Any)),
                _ => None,
            }
        }
        _ => None,
    }
}

fn optional_property_type(t: &Ty) -> Ty {
    let TypeKind::Union(u) = &**t else {
        return new_union_type(&[t.clone(), new(TypeKind::Undefined)]);
    };
    if u.types().iter().any(|s| matches!(&**s, TypeKind::Undefined)) {
        return t.clone();
    }
    let mut v = u.types().to_vec();
    v.push(new(TypeKind::Undefined));
    new_union_type(&v)
}

fn composite_by_key(composite: &Ty, member_types: &[Ty], index: &Ty) -> Option<Ty> {
    let sub_types: Vec<Ty> = member_types.iter().filter_map(|s| get_type_by_key(s, index)).collect();
    let sub_types = unique_types(&sub_types);
    match sub_types.len() {
        0 => return None,
        1 => return Some(sub_types[0].clone()),
        _ => {}
    }
    let first = sub_types[0].clone();
    if matches!(&**composite, TypeKind::Union(_)) {
        Some(preserve_annotation(&first, new_union_type(&sub_types)))
    } else {
        Some(preserve_annotation(&first, translate(&sub_types)))
    }
}
