// Column annotations. `fabric db` is a coworker, not a codegen: it fills in the derived
// `kind` for your typed columns here — but this file is yours to edit too.
//
// Give a column a SEMANTIC type in your migration and it is typed + coerced
// end-to-end. On SQLite only the first of these is derived for you; the other two
// you add by hand, once:
//   - BOOLEAN column   -> kind 'bool'                    -> `boolean` (derived; write true/false)
//   - TIMESTAMP/DATE   -> kind 'date'                    -> `Date`   (ADD BY HAND, else `string`)
//   - JSON column      -> kind 'json' + a `tsType`       -> parsed    (ADD BY HAND, else `unknown`)
// e.g.  ascent: { climbed_at: { kind: 'date' }, meta: { kind: 'json', tsType: 'Meta' } }
// A plain INTEGER flag or TEXT date is fine too — it just types as number/string; use
// a semantic type when you want a real boolean/Date/object. Never write 0/1 or ISO
// strings for a typed column, and never fight the generated type with casts.
//
// Add your own security/classification annotations by hand (the data-classification
// flow) and `fabric db` steps aside — once this file carries manual fields it won't
// overwrite them.
export const classifications = {}
