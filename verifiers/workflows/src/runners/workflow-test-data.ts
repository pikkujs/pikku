/**
 * Test data for all workflow verifiers
 * Maps workflow names to appropriate test inputs
 */

export const workflowTestData: Record<string, any> = {
  // CRM workflows
  bulkContactEnrichmentWorkflow: {
    contactIds: ['contact-1', 'contact-2', 'contact-3'],
  },
  bulkLeadQualificationWorkflow: {
    leadIds: ['lead-1', 'lead-2', 'lead-3'],
    minimumScore: 50,
  },
  contactMergeWorkflow: {
    primaryContactId: 'contact-1',
    duplicateContactIds: ['contact-2', 'contact-3'],
  },
  dealStageWithApprovalWorkflow: {
    dealId: 'deal-1',
    targetStage: 'proposal',
    requiresApproval: true,
  },

  // Document workflows
  documentApprovalWorkflow: {
    title: 'Test Document',
    content: 'This is the document content',
    authorId: 'user-1',
    reviewerIds: ['reviewer-1', 'reviewer-2'],
  },
  documentArchiveBatchWorkflow: {
    authorId: 'user-1',
    status: 'approved',
    olderThanDays: 30,
  },
  documentBatchProcessingWorkflow: {
    documentIds: ['doc-1', 'doc-2', 'doc-3'],
    operation: 'validate',
  },
  documentRejectionWorkflow: {
    documentId: 'doc-1',
    reviewerId: 'user-1',
    reason: 'Missing signatures',
  },
  documentRollbackWorkflow: {
    documentId: 'doc-1',
    targetVersion: 1,
    reason: 'Rolling back to previous version',
  },
  documentVersionHistoryWorkflow: {
    documentId: 'doc-1',
  },
  documentVersioningWorkflow: {
    documentId: 'doc-1',
    newContent: 'Updated content',
    changeNote: 'Minor updates',
    notifyWatchers: true,
  },
  multiLevelApprovalWorkflow: {
    documentId: 'doc-1',
    approvalLevels: [
      { level: 1, approverId: 'approver-1' },
      { level: 2, approverId: 'approver-2' },
    ],
  },
  parallelBatchProcessingWorkflow: {
    documentIds: ['doc-1', 'doc-2', 'doc-3'],
    operation: 'validate',
  },

  // Ecommerce workflows
  autoRestockWorkflow: {
    productId: 'prod-1',
    minStock: 10,
    restockQuantity: 100,
  },
  batchFulfillmentWorkflow: {
    orderIds: ['order-1', 'order-2', 'order-3'],
    carrier: 'fedex',
  },
  bulkInventoryUpdateWorkflow: {
    updates: [
      { productId: 'prod-1', quantity: 50, operation: 'add' },
      { productId: 'prod-2', quantity: 30, operation: 'subtract' },
    ],
  },
  cartCheckoutWorkflow: {
    customerId: 'customer-1',
    shippingAddress: '123 Main St',
    paymentMethodId: 'pm-1',
  },
  expressCheckoutWorkflow: {
    customerId: 'customer-1',
    productId: 'prod-1',
    quantity: 2,
    paymentMethodId: 'pm-1',
  },
  inventoryRestockWorkflow: {
    threshold: 10,
    supplierId: 'supplier-1',
  },
  orderCancellationWorkflow: {
    orderId: 'order-1',
    reason: 'Customer request',
  },
  orderFulfillmentWorkflow: {
    orderId: 'order-1',
    carrier: 'fedex',
  },
  orderProcessingWorkflow: {
    customerId: 'customer-1',
    items: [{ productId: 'prod-1', quantity: 2, price: 29.99 }],
    paymentMethodId: 'pm-1',
  },
  orderWithInventoryCheckWorkflow: {
    customerId: 'customer-1',
    items: [{ productId: 'prod-1', quantity: 5, price: 29.99 }],
  },
  partialCancellationWorkflow: {
    orderId: 'order-1',
    itemsToCancel: ['item-1', 'item-2'],
    reason: 'Partial cancellation',
  },

  // Notification workflows
  broadcastNotificationWorkflow: {
    userIds: ['user-1', 'user-2', 'user-3'],
    title: 'Test Broadcast',
    message: 'This is a test broadcast message',
    channel: 'push',
  },
  digestBuilderWorkflow: {
    userId: 'user-1',
    since: '2024-01-01T00:00:00Z',
    format: 'html',
  },
  escalationChainWorkflow: {
    alertTitle: 'Critical Alert',
    alertMessage: 'System down',
    escalationLevels: [
      { userId: 'user-1', waitTime: '10ms', level: 1 },
      { userId: 'user-2', waitTime: '10ms', level: 2 },
    ],
  },
  multiChannelNotifyWorkflow: {
    userId: 'user-1',
    title: 'Multi-Channel Alert',
    message: 'Test notification',
    channels: ['email', 'push', 'sms'],
  },
  preferenceBasedNotifyWorkflow: {
    userId: 'user-1',
    title: 'Preference Notification',
    message: 'Based on your preferences',
  },
  scheduledDigestComplexWorkflow: {
    userIds: ['user-1', 'user-2'],
    since: '2024-01-01T00:00:00Z',
  },
  timedReminderWorkflow: {
    userId: 'user-1',
    reminderTitle: 'Reminder',
    reminderMessage: 'Reminder message',
    intervals: ['10ms', '10ms'],
  },
  urgentAlertWorkflow: {
    alertTitle: 'Urgent Alert',
    alertMessage: 'Urgent alert message',
    oncallUserIds: ['user-1', 'user-2'],
  },
  weeklySummaryDigestWorkflow: {
    userId: 'user-1',
  },

  // Onboarding workflows
  bulkTeamMemberAddWorkflow: {
    teamId: 'team-1',
    userIds: ['user-1', 'user-2', 'user-3'],
    defaultRole: 'member',
  },
  orgWithSubscriptionWorkflow: {
    orgName: 'Test Org',
    adminEmail: 'admin@test.com',
    plan: 'enterprise',
  },
  teamRoleUpdateWorkflow: {
    teamId: 'team-1',
    userId: 'user-1',
    newRole: 'admin',
    reason: 'Promotion',
  },
  userSignupWithOnboardingWorkflow: {
    email: 'newuser@test.com',
    name: 'New User',
    onboardingSteps: ['profile', 'tutorial', 'welcome'],
  },

  // Patterns workflows
  batchChunkedAggregationWorkflow: {
    documentChunks: [
      ['doc-1', 'doc-2'],
      ['doc-3', 'doc-4'],
    ],
  },
  booleanExpressionWorkflow: {
    isUrgent: true,
    isHighValue: true,
    requiresApproval: false,
    customerTier: 2,
  },
  complexConditionalBranchingWorkflow: {
    customerId: 'customer-1',
    orderValue: 500,
    customerType: 'vip',
    hasPromoCode: true,
  },
  complexFilterChainWorkflow: {
    orders: [
      {
        id: 'order-1',
        total: 100,
        status: 'pending',
        customerId: 'customer-1',
        createdAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 'order-2',
        total: 200,
        status: 'completed',
        customerId: 'customer-2',
        createdAt: '2024-01-02T00:00:00Z',
      },
    ],
    minTotal: 50,
    targetStatus: 'pending',
  },
  criticalOperationRetryWorkflow: {
    operationId: 'op-1',
    maxAttempts: 3,
  },
  distributedTransactionSagaWorkflow: {
    sourceAccountId: 'account-1',
    targetAccountId: 'account-2',
    amount: 100.0,
  },
  fanOutAggregateWorkflow: {
    userIds: ['user-1', 'user-2', 'user-3'],
  },
  filterAndProcessWorkflow: {
    items: [
      { id: 'item-1', status: 'active', priority: 1 },
      { id: 'item-2', status: 'inactive', priority: 2 },
      { id: 'item-3', status: 'active', priority: 3 },
    ],
  },
  filterParallelProcessWorkflow: {
    emails: ['user1@example.com', 'user2@example.com', 'user3@example.com'],
  },
  findFirstMatchWorkflow: {
    candidates: [
      { id: 'c-1', score: 30, available: true },
      { id: 'c-2', score: 85, available: true },
      { id: 'c-3', score: 90, available: false },
    ],
  },
  matrixIterationWorkflow: {
    rows: ['row-1', 'row-2'],
    columns: ['col-1', 'col-2', 'col-3'],
  },
  multiSourceAggregationWorkflow: {
    projectId: 'project-1',
  },
  multiTierSwitchWorkflow: {
    tier: 'pro',
    action: 'upgrade',
  },
  multipleRetryableStepsWorkflow: {
    orderId: 'order-1',
    paymentMethodId: 'pm-1',
  },
  nestedConditionalWorkflow: {
    leadId: 'lead-1',
    score: 75,
    hasCompany: true,
    budget: 10000,
  },
  nestedLoopParallelInnerWorkflow: {
    departments: [
      { name: 'Engineering', memberIds: ['m-1', 'm-2'] },
      { name: 'Sales', memberIds: ['m-3', 'm-4'] },
    ],
  },
  nestedLoopWithConditionWorkflow: {
    userIds: ['user-1', 'user-2'],
    maxComments: 3,
  },
  pipelineAggregationWorkflow: {
    leadIds: ['lead-1', 'lead-2', 'lead-3'],
  },
  regionBasedRoutingWorkflow: {
    region: 'us',
    userId: 'user-1',
  },
  retryWithBackoffWorkflow: {
    userId: 'user-1',
    message: 'Test message',
  },
  sagaWithCompensationLogicWorkflow: {
    orderId: 'order-1',
    shouldFail: false,
  },
  someEveryPredicatesWorkflow: {
    userIds: ['user-1', 'user-2'],
    requiredRole: 'admin',
  },
  tripleNestedLoopWorkflow: {
    organizations: [
      {
        orgId: 'org-1',
        projects: [
          { projectId: 'proj-1', taskIds: ['task-1', 'task-2'] },
          { projectId: 'proj-2', taskIds: ['task-3'] },
        ],
      },
    ],
  },

  // Project workflows
  bulkMemberRemovalWorkflow: {
    projectId: 'project-1',
    memberIds: ['member-1', 'member-2'],
    notifyMembers: true,
  },
  bulkProjectArchiveWorkflow: {
    projectIds: ['project-1', 'project-2'],
  },
  memberRoleUpdateWorkflow: {
    projectId: 'project-1',
    userId: 'user-1',
    newRole: 'admin',
    notifyMember: true,
  },
  projectArchiveWorkflow: {
    projectId: 'project-1',
    notifyMembers: true,
  },
  projectCleanupAndArchiveWorkflow: {
    projectId: 'project-1',
    completePendingTasks: true,
  },
  projectSetupWorkflow: {
    name: 'New Project',
    description: 'Project description',
    ownerId: 'user-1',
    initialTasks: ['Task 1', 'Task 2'],
  },
  projectTemplateSetupWorkflow: {
    name: 'From Template',
    ownerId: 'user-1',
    template: 'agile',
  },
  projectWithMembersWorkflow: {
    name: 'Team Project',
    ownerId: 'user-1',
    memberInvites: [
      { userId: 'user-2', role: 'member' },
      { userId: 'user-3', role: 'viewer' },
    ],
  },

  // Task workflows
  bulkTaskAssignmentWorkflow: {
    tasks: [
      { title: 'Task 1', assigneeId: 'user-1' },
      { title: 'Task 2', assigneeId: 'user-2' },
    ],
  },
  nestedTaskHierarchyWorkflow: {
    rootTitle: 'Root Task',
    level1Titles: ['Child 1', 'Child 2'],
    level2Titles: ['Grandchild 1', 'Grandchild 2'],
  },
  parallelCommentsWorkflow: {
    taskId: 'task-1',
    comments: [
      { content: 'Comment 1', authorId: 'user-1' },
      { content: 'Comment 2', authorId: 'user-2' },
    ],
  },
  parallelSubtasksWorkflow: {
    parentTaskId: 'task-1',
    subtaskTitles: ['Subtask A', 'Subtask B', 'Subtask C'],
  },
  parallelTagsWorkflow: {
    taskId: 'task-1',
    tagsToAdd: ['urgent', 'bug', 'backend'],
    tagsToRemove: ['frontend'],
  },
  tagCategorizationWorkflow: {
    tasks: [
      { title: 'Task 1', priority: 'high', type: 'bug' },
      { title: 'Task 2', priority: 'medium', type: 'feature' },
    ],
  },
  taskAssignmentWorkflow: {
    title: 'New Task',
    assigneeId: 'user-1',
    notifyAssignee: true,
  },
  taskCrudWorkflow: {
    title: 'Test Task',
    description: 'A test task for verification',
  },
  taskListWorkflow: {
    projectId: 'project-1',
    taskTitles: ['Task 1', 'Task 2', 'Task 3'],
  },
  taskReassignmentWorkflow: {
    taskId: 'task-1',
    newAssigneeId: 'user-2',
    addComment: true,
  },
  taskWithCommentsWorkflow: {
    title: 'Task with Comments',
    comments: [
      { content: 'First comment', authorId: 'user-1' },
      { content: 'Second comment', authorId: 'user-2' },
    ],
  },
  taskWithSubtasksWorkflow: {
    parentTitle: 'Parent Task',
    subtaskTitles: ['Child 1', 'Child 2'],
  },
  taskWithTagsWorkflow: {
    title: 'Tagged Task',
    tags: ['important', 'review'],
    tagsToRemove: ['draft'],
  },

  // Graph workflows
  graphOnboarding: {
    email: 'newuser@test.com',
    name: 'New User',
  },
}
