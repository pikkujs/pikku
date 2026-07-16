import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computedSetSource, setAssignments } from './set-translate.js'

test('setAssignments reads the v2 values.string shape', () => {
  const a = setAssignments({
    values: { string: [{ name: 'x', value: 'hi' }] },
    keepOnlySet: true,
  })
  assert.deepEqual(a, [{ field: 'x', value: 'hi' }])
})

test('a Set node with only literals/refs is NOT functionized', () => {
  assert.equal(
    computedSetSource({
      values: {
        string: [
          { name: 'a', value: 'static' },
          { name: 'b', value: '={{ $json.email }}' },
          { name: 'c', value: '=Hi {{ $json.name }}' },
        ],
      },
    }),
    null
  )
})

test('a Set node with a transform field is functionized to a return object', () => {
  const src = computedSetSource({
    values: {
      string: [
        { name: 'greeting', value: '=Hi {{ $json.name }}' },
        { name: 'total', value: '={{ $json.a * 1.2 }}' },
        { name: 'label', value: 'fixed' },
      ],
    },
  })
  assert.ok(src, 'source emitted')
  // a whole-value expression is raw JS (not string-coerced)
  assert.match(src!, /"total":\s*\$json\.a \* 1\.2/)
  // a literal stays a JSON literal
  assert.match(src!, /"label":\s*"fixed"/)
  // a template becomes a JS template literal
  assert.match(src!, /"greeting":\s*`Hi \$\{\s*\$json\.name\s*\}`/)
  // it is a function body returning the object
  assert.match(src!, /^return \{/)
})

test('a cross-node reference inside a transform is preserved verbatim for the shim', () => {
  const src = computedSetSource({
    values: {
      string: [
        {
          name: 'k',
          value: "={{ $node['Webhook'].json.h + '-' + new Date().getHours() }}",
        },
      ],
    },
  })
  assert.ok(src)
  assert.match(
    src!,
    /\$node\['Webhook'\]\.json\.h \+ '-' \+ new Date\(\)\.getHours\(\)/
  )
})

test('a transform reaching outside its input ($vars) is NOT functionized (stays editFields)', () => {
  // $vars would bail translation to a throwing stub — worse than an editFields
  // node that merely drops the one field — so the node is left declarative.
  assert.equal(
    computedSetSource({
      values: { string: [{ name: 'u', value: '={{ $vars.apiUrl + "/x" }}' }] },
    }),
    null
  )
})
