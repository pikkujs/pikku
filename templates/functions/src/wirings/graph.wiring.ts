import { graphStart } from '../../.pikku/workflow/pikku-workflow-types.gen.js'
import { wireHTTP } from '../../.pikku/pikku-types.gen.js'

wireHTTP({
  auth: false,
  method: 'post',
  route: '/workflow/review',
  func: graphStart('todoReviewWorkflow', 'fetchOverdue'),
})
