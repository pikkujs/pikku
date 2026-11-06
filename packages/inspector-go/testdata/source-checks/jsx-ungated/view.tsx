import * as React from 'react'
declare const x: string, n: number, cond: boolean
declare const Foo: any, Member: any

export const View = () => (
  <>
    Fragment text here
    <div>Hello there</div>
    <div>{'string child'}</div>
    <div>{`template child`}</div>
    <div>{`template ${x} child`}</div>
    <div>{cond ? 'Yes please' : 'No thanks'}</div>
    <div>{cond && 'Shown text'}</div>
    <div>{x || 'Fallback text'}</div>
    <div>{x ?? 'Nullish text'}</div>
    <div>{('Paren text')}</div>
    <div>{'Cast text' as string}</div>
    <div>{'Satisfies text' satisfies string}</div>
    <div>{x!}</div>
    <div>{...[x]}</div>
    <div>{/* comment child */}</div>
    <div>{}</div>
    <Foo>Component text</Foo>
    <Foo>{'component string child'}</Foo>
    <Foo>{cond ? 'Component yes' : 'Component no'}</Foo>
    <Foo>{`Step ${n} of total`}</Foo>
    <Member.Tag>Member tag text</Member.Tag>
    <ns:tag>Namespaced tag text</ns:tag>
    <svg><text>Label inside svg</text></svg>
    <foo-bar>Dashed lowercase tag text</foo-bar>
    <_Under>Underscore tag text</_Under>
    <$Dollar>Dollar tag text</$Dollar>
    <div>·</div>
    <div>—</div>
    <div>…</div>
    <div> · </div>
    <div>/</div>
    <div>•</div>
    <div>12345</div>
    <div>{' '}</div>
    <div>{' '}</div>
    <div>{'  '}</div>
    <div>{"·"}</div>
    <div>Fish &amp; Chips</div>
    <div>&nbsp;</div>
    <div>&nbsp;Non breaking text</div>
    <div>&#x41; hex entity</div>
    <div>&#66; decimal entity</div>
    <div>&bogus; unknown entity</div>
    <div>
      Multi line text
      across several lines
        with	tabs
    </div>
    <div>Héllo wörld — ünïcode</div>
    <div>日本語のテキスト</div>
    <div>😀 emoji start and a long label that goes on for quite a while so that it passes the one hundred and sixty character limit of the hit text field ok</div>
    <div>😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀 tail text</div>
    <div>{'😀'.repeat(2)} after emoji</div>
    <div title="Attribute not text">x1</div>
    <div>{'a'}{'b'}</div>
    <a href="https://example.com">Link text</a>
    <pre>Pre text here</pre>
    <code>Code text here</code>
    <div>{'Hello ' + x}</div>
    <div>{fn('Call arg text')}</div>
    <div>{[ 'Array text' ]}</div>
  </>
)
declare function fn(x: string): string
