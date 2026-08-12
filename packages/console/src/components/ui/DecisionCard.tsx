import React from 'react'
import { Check, Ban, CornerDownRight } from 'lucide-react'
import { m } from '@/i18n/messages'
import type { Decision } from '../../lib/decisionFence'
import classes from './console.module.css'

/**
 * A ```decision fence, drawn as the decision it states.
 *
 * Three labelled rows rather than a prose paragraph, because the three parts are
 * read at different times: what was chosen is what a reader came for, what it
 * rules out is what stops the next person reopening it, and the reason is what
 * they need if they want to. As a paragraph the middle one is a subordinate
 * clause somebody skims past.
 *
 * A decision with no `rules-out` renders with the row absent, not blank — the
 * gap is the point, and `pikku knowledge validate` warns about the same note.
 */
export const DecisionCard: React.FC<{ decision: Decision }> = ({
  decision,
}) => (
  <div className={classes.decisionCard}>
    <div className={classes.decisionRow} data-part="chosen">
      <Check size={14} aria-hidden />
      <div>
        <div className={classes.decisionLabel}>
          {m.markdown_decision_chosen()}
        </div>
        <p>{decision.chosen}</p>
      </div>
    </div>

    {decision.rulesOut.length > 0 && (
      <div className={classes.decisionRow} data-part="rules-out">
        <Ban size={14} aria-hidden />
        <div>
          <div className={classes.decisionLabel}>
            {m.markdown_decision_rules_out()}
          </div>
          {/* A list even at one item: the label is plural because a decision
              usually closes off more than one thing, and a bare paragraph under
              a plural label reads as a truncation. */}
          <ul>
            {decision.rulesOut.map((ruled) => (
              <li key={ruled}>{ruled}</li>
            ))}
          </ul>
        </div>
      </div>
    )}

    {decision.because && (
      <div className={classes.decisionRow} data-part="because">
        <CornerDownRight size={14} aria-hidden />
        <div>
          <div className={classes.decisionLabel}>
            {m.markdown_decision_because()}
          </div>
          <p>{decision.because}</p>
        </div>
      </div>
    )}
  </div>
)
