import * as React from 'react'
declare const x: string, n: number, cond: boolean, obj: any
declare const Foo: any, Member: any
declare function say(x: string): void
declare function notify(x: string): void
declare const toast: any
declare function fn(...a: any[]): any

export const View = () => (
  <>
    <Foo title="Hello title" />
    <Foo title={'Braced title'} />
    <Foo title={`Template title`} />
    <Foo title={`Template ${x} title`} />
    <Foo title={cond ? 'Title yes' : 'Title no'} />
    <Foo title={x || 'Title fallback'} />
    <Foo title={x ?? 'Title nullish'} />
    <Foo title={cond && 'Title and'} />
    <Foo title={cond && x && 'Title and chain'} />
    <Foo title={('Title paren')} />
    <Foo title={'Title cast' as string} />
    <Foo title={'Title satisfies' satisfies string} />
    <Foo title={'Title nonnull'!} />
    <Foo title={fn('Title call')} />
    <Foo title={x} />
    <Foo title />
    <Foo title={cond ? (x || 'Nested fallback text') : `Nested ${n} template`} />
    <Foo sub="Sub copy" crumb="Crumb copy" text="Text copy" label="Label copy" />
    <Foo placeholder="Placeholder copy" aria-label="Aria label copy" alt="Alt copy" />
    <Foo description="Description copy" tooltip="Tooltip copy" what="What copy" hint="Hint copy" />
    <Foo heading="Heading copy" caption="Caption copy" helperText="Helper text copy" />
    <Foo aria-description="Aria description copy" aria-hidden="true" aria-other="Other aria copy" />
    <Foo name="Name should skip" value="Value should skip" className="a b c d" id="Some id here" />
    <Foo data-title="Data attribute copy" data-label="Another data copy" />
    <Foo unknownProp="Unknown prop copy" children="Children prop copy" />
    <Foo label="Save" />
    <Foo label="save" />
    <Foo label="Don’t" />
    <Foo label="Hello, World" />
    <Foo label="https://example.com/a b" />
    <Foo label="/path/to something" />
    <Foo label="./relative thing" />
    <Foo label="mailto:me@example.com" />
    <Foo label="#anchor text" />
    <Foo label="@mention text" />
    <Foo label="flex items-center gap-2" />
    <Foo label="w-1/2 sm:flex" />
    <Foo label="import x from 'y'" />
    <Foo label="const a = 1;" />
    <Foo label="x => y" />
    <Foo label="Sentence with {…} placeholder" />
    <Foo label="·" />
    <Foo label="—" />
    <Foo label="1234 5678" />
    <Foo label="Multi   spaced
      and newlined label" />
    <Foo label="Héllo wörld — ünïcode" />
    <Foo label="Ünïcode" />
    <Foo label="日本語" />
    <Foo label="Fish &amp; Chips label" />
    <Foo label="&#x41;bc def" />
    <Foo label="😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀 tail copy" />
    <Foo xlink:title="Namespaced attribute copy" />
    <Foo {...obj} title="After spread title" />
    <div title="Div title copy" placeholder="Div placeholder copy" label="Div label copy" aria-label="Div aria copy" />
    <div className="Not copy here" data-x="Not copy either">{cond ? 'Div ternary child' : 'Div other child'}</div>
    <Member.Tag title="Member title copy" />
    <ns:tag title="Namespaced tag title" />
    <svg><text title="Svg text title">{cond ? 'Svg ternary' : 'Svg other'}</text></svg>
    <foo-bar title="Dashed tag title" />
    <code title="Code title copy">{cond ? 'Code ternary child' : 'Code other child'}</code>
    <pre label="Pre label copy"><span title="Inside pre title">{x || 'Inside pre fallback'}</span></pre>
    <Foo><code>{say('Say inside code element')}{cond ? 'Code in foo' : 'Code in foo too'}</code></Foo>
    <code><Foo title="Foo inside code" /></code>
    <div>{cond ? 'Child yes' : 'Child no'}</div>
    <div>{cond && 'Child and text'}</div>
    <div>{x || 'Child fallback'}</div>
    <div>{x ?? 'Child nullish'}</div>
    <div>{`Child ${n} template`}</div>
    <div>{`Plain template child`}</div>
    <div>{'Direct child string'}</div>
    <div>{('Paren child string')}</div>
    <div>{'Cast child' as string}</div>
    <div>{cond ? <b>element</b> : 'Mixed branch text'}</div>
    <div>{fn('Child call arg')}</div>
    <div>{say('Say in child')}</div>
    <div>{toast.success('Toast in child')}</div>
    <div>{...[x]}</div>
    <div>{}</div>
    <>{cond ? 'Fragment yes' : 'Fragment no'}</>
    <Foo>{cond ? 'Foo yes' : 'Foo no'}</Foo>
    <Foo>{(cond ? 'Foo paren yes' : 'Foo paren no')}</Foo>
    <Foo onClick={() => say('Clicked it now')} />
    <Foo onClick={() => { toast.success('Saved changes'); notify(`Hello ${x} friend`); obj.say('Member say call') }} />
    <Foo onClick={() => say(cond ? 'Say yes' : 'Say no')} />
    <Foo onClick={() => say(x || 'Say fallback')} />
    <Foo onClick={() => say(x)} />
    <Foo onClick={() => say()} />
    <Foo onClick={() => say(...['Spread say text'])} />
    <Foo onClick={() => a.b.say('Deep member say')} />
    <Foo onClick={() => toast('Toast direct call')} />
    <Foo onClick={() => toast.error('Toast error one', 'Toast error two')} />
    <Foo onClick={() => fn('Plain helper call')} />
    <Foo onClick={() => m.thing('Custom helper')} />
    <Foo onClick={() => console.log('Console helper text')} />
    <Foo onClick={() => say('Save')} />
    <Foo onClick={() => say('/path/like text')} />
    <Foo onClick={() => say(`Template ${x} in say`)} />
    <Foo onClick={() => say('Multi\nline say text')} />
    <Foo onClick={() => ((say))('Parenthesised callee')} />
    <Foo onClick={() => say?.('Optional call say')} />
    <Foo onClick={() => obj?.toast.warn('Optional member toast')} />
  </>
)
declare const a: any, m: any
const outside = () => say('Outside JSX say')
const alsoOutside = toast.info('Outside toast text')
