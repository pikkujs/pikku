//! Port of Go `tsjg/formatter/make_nullable.go`.

use serde_json::Value;

use crate::tsjg::schema::{Def, Definition, def};

/// Mutates the definition so that it also allows null (makeNullable in
/// src/TypeFormatter/AnnotatedTypeFormatter.ts).
pub fn make_nullable(d: &Def) -> Def {
    let mut b = d.borrow_mut();
    let has_union = b.one_of.is_some() || b.any_of.is_some();
    let union_has_null = {
        let union = if b.one_of.is_some() { &b.one_of } else { &b.any_of };
        union_has_null(union.as_deref())
    };

    if has_union && !union_has_null {
        let null = def(Definition::with_type("null"));
        if let Some(one_of) = &mut b.one_of {
            one_of.push(null);
        } else if let Some(any_of) = &mut b.any_of {
            any_of.push(null);
        }
    } else if b.type_.is_some() && !b.type_is("object") {
        match b.type_.clone().unwrap() {
            Value::Array(mut t) => {
                if !t.iter().any(|v| v.as_str() == Some("null")) {
                    t.push(Value::String("null".into()));
                    b.type_ = Some(Value::Array(t));
                }
            }
            other => {
                if !b.type_is("null") {
                    let type_str = other.as_str().unwrap_or("").to_string();
                    b.type_ = Some(Value::Array(vec![Value::String(type_str), Value::String("null".into())]));
                }
            }
        }

        // Enums need null as an option.
        if let Some(e) = &mut b.enum_ {
            if !e.iter().any(|v| v.is_null()) {
                e.push(Value::Null);
            }
        }
    } else {
        if union_has_null_ref(&b.any_of) {
            drop(b);
            return d.clone();
        }

        // Move every key except description, title, and default into a
        // sub-definition and wrap it in an anyOf with null.
        let mut subdef = b.clone();
        subdef.title = String::new();
        subdef.extra.remove("description");
        subdef.extra.remove("default");

        let mut kept_extra = std::collections::BTreeMap::new();
        for key in ["description", "default"] {
            if let Some(v) = b.extra.get(key) {
                kept_extra.insert(key.to_string(), v.clone());
            }
        }

        let title = b.title.clone();
        *b = Definition { title, extra: kept_extra, ..Definition::default() };
        b.any_of = Some(vec![def(subdef), def(Definition::with_type("null"))]);
    }
    drop(b);
    d.clone()
}

fn union_has_null(list: Option<&[Def]>) -> bool {
    list.is_some_and(|l| l.iter().any(|d| d.borrow().type_is("null")))
}

fn union_has_null_ref(list: &Option<Vec<Def>>) -> bool {
    union_has_null(list.as_deref())
}
