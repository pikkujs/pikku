import React, { useMemo } from 'react'
import { m } from '@/i18n/messages'
import { parseGherkin } from '../../lib/gherkin'
import { ScrollRegion } from './ScrollRegion'
import classes from './console.module.css'

/**
 * A slice's scenario: the step keyword set apart, personas as chips, everything
 * else the author's own words.
 *
 * Not `CodeHighlight`, which the other fences get. A scenario is not code the
 * reader means to take — there is nothing to copy it into — it is the sentence
 * that says what the slice has to do, and the one thing worth carrying over from
 * a code surface is that a long step must not widen the document.
 */
export const GherkinBlock: React.FC<{ code: string }> = ({ code }) => {
  const lines = useMemo(() => parseGherkin(code), [code])

  return (
    <ScrollRegion
      className={classes.gherkinScroll}
      label={m.markdown_scenario_label()}
    >
      <div className={classes.gherkin}>
        {lines.map((line, index) => (
          <div
            key={index}
            className={classes.gherkinLine}
            data-heading={line.heading || undefined}
          >
            {line.keyword && (
              // The trailing space is inside the column, which is already 6ch
              // wide to hold it, so it costs nothing visually and keeps the
              // line's text content a sentence — without it the keyword and the
              // first word run together for anything reading the DOM rather
              // than the layout, a screen reader among them.
              <span className={classes.gherkinKeyword}>{line.keyword} </span>
            )}
            <span>
              {line.tokens.map((token, position) =>
                token.type === 'persona' ? (
                  <span key={position} className={classes.gherkinPersona}>
                    {token.value}
                  </span>
                ) : (
                  <React.Fragment key={position}>{token.value}</React.Fragment>
                )
              )}
            </span>
          </div>
        ))}
      </div>
    </ScrollRegion>
  )
}
