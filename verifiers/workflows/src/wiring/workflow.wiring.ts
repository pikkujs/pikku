/**
 * Workflow Wiring
 *
 * This file imports all workflows so the CLI can extract their graph definitions.
 * The workflows themselves are DSL-based and will be analyzed by the pikku CLI.
 */

// CRM Workflows
import '../workflows/crm/bulk-contact-enrichment.workflow.js'
import '../workflows/crm/bulk-lead-qualification.workflow.js'
import '../workflows/crm/contact-merge.workflow.js'
import '../workflows/crm/deal-stage-with-approval.workflow.js'

// Document Workflows
import '../workflows/document/document-approval.workflow.js'
import '../workflows/document/document-archive-batch.workflow.js'
import '../workflows/document/document-batch-processing.workflow.js'
import '../workflows/document/document-rejection.workflow.js'
import '../workflows/document/document-rollback.workflow.js'
import '../workflows/document/document-version-history.workflow.js'
import '../workflows/document/document-versioning.workflow.js'
import '../workflows/document/multi-level-approval.workflow.js'
import '../workflows/document/parallel-batch-processing.workflow.js'

// E-commerce Workflows
import '../workflows/ecommerce/auto-restock.workflow.js'
import '../workflows/ecommerce/batch-fulfillment.workflow.js'
import '../workflows/ecommerce/bulk-inventory-update.workflow.js'
import '../workflows/ecommerce/cart-checkout.workflow.js'
import '../workflows/ecommerce/express-checkout.workflow.js'
import '../workflows/ecommerce/inventory-restock.workflow.js'
import '../workflows/ecommerce/order-cancellation.workflow.js'
import '../workflows/ecommerce/order-fulfillment.workflow.js'
import '../workflows/ecommerce/order-processing.workflow.js'
import '../workflows/ecommerce/order-with-inventory-check.workflow.js'
import '../workflows/ecommerce/partial-cancellation.workflow.js'

// Notification Workflows
import '../workflows/notification/broadcast-notification.workflow.js'
import '../workflows/notification/digest-builder.workflow.js'
import '../workflows/notification/escalation-chain.workflow.js'
import '../workflows/notification/multi-channel-notify.workflow.js'
import '../workflows/notification/preference-based-notify.workflow.js'
import '../workflows/notification/scheduled-digest-complex.workflow.js'
import '../workflows/notification/timed-reminder.workflow.js'
import '../workflows/notification/urgent-alert.workflow.js'
import '../workflows/notification/weekly-summary-digest.workflow.js'

// Onboarding Workflows
import '../workflows/onboarding/bulk-team-member-add.workflow.js'
import '../workflows/onboarding/org-with-subscription.workflow.js'
import '../workflows/onboarding/team-role-update.workflow.js'
import '../workflows/onboarding/user-signup-with-onboarding.workflow.js'

// Pattern Workflows
import '../workflows/patterns/batch-chunked-aggregation.workflow.js'
import '../workflows/patterns/boolean-expression.workflow.js'
import '../workflows/patterns/complex-conditional-branching.workflow.js'
import '../workflows/patterns/complex-filter-chain.workflow.js'
import '../workflows/patterns/critical-operation-retry.workflow.js'
import '../workflows/patterns/distributed-transaction-saga.workflow.js'
import '../workflows/patterns/fan-out-aggregate.workflow.js'
import '../workflows/patterns/filter-and-process.workflow.js'
import '../workflows/patterns/filter-parallel-process.workflow.js'
import '../workflows/patterns/find-first-match.workflow.js'
import '../workflows/patterns/matrix-iteration.workflow.js'
import '../workflows/patterns/multi-source-aggregation.workflow.js'
import '../workflows/patterns/multi-tier-switch.workflow.js'
import '../workflows/patterns/multiple-retryable-steps.workflow.js'
import '../workflows/patterns/nested-conditional.workflow.js'
import '../workflows/patterns/nested-loop-parallel-inner.workflow.js'
import '../workflows/patterns/nested-loop-with-condition.workflow.js'
import '../workflows/patterns/pipeline-aggregation.workflow.js'
import '../workflows/patterns/region-based-routing.workflow.js'
import '../workflows/patterns/retry-with-backoff.workflow.js'
import '../workflows/patterns/saga-with-compensation-logic.workflow.js'
import '../workflows/patterns/some-every-predicates.workflow.js'
import '../workflows/patterns/triple-nested-loop.workflow.js'

// Project Workflows
import '../workflows/project/bulk-member-removal.workflow.js'
import '../workflows/project/bulk-project-archive.workflow.js'
import '../workflows/project/member-role-update.workflow.js'
import '../workflows/project/project-archive.workflow.js'
import '../workflows/project/project-cleanup-and-archive.workflow.js'
import '../workflows/project/project-setup.workflow.js'
import '../workflows/project/project-template-setup.workflow.js'
import '../workflows/project/project-with-members.workflow.js'

// Task Workflows
import '../workflows/task/bulk-task-assignment.workflow.js'
import '../workflows/task/nested-task-hierarchy.workflow.js'
import '../workflows/task/parallel-comments.workflow.js'
import '../workflows/task/parallel-subtasks.workflow.js'
import '../workflows/task/parallel-tags.workflow.js'
import '../workflows/task/tag-categorization.workflow.js'
import '../workflows/task/task-assignment.workflow.js'
import '../workflows/task/task-crud.workflow.js'
import '../workflows/task/task-list.workflow.js'
import '../workflows/task/task-reassignment.workflow.js'
import '../workflows/task/task-with-comments.workflow.js'
import '../workflows/task/task-with-subtasks.workflow.js'
import '../workflows/task/task-with-tags.workflow.js'
