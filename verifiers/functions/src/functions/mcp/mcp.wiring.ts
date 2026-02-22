import { wireMCPResource, wireMCPPrompt } from '#pikku'
import {
  getUserInfo,
  dynamicPromptGenerator,
  getStaticResource,
  staticPromptGenerator,
} from './mcp.functions.js'

wireMCPResource({
  uri: 'getStaticResource',
  title: 'Static Resource',
  description: 'Gets a static resource with predefined data',
  func: getStaticResource,
})

wireMCPResource({
  uri: 'getUserInfo/{userId}',
  title: 'User Information',
  description: 'Retrieve user information by user ID',
  func: getUserInfo,
  tags: ['user', 'profile', 'data'],
})

wireMCPPrompt({
  name: 'getStaticResource',
  description: 'A static prompt that returns a predefined message',
  func: staticPromptGenerator,
})

wireMCPPrompt({
  name: 'dynamicPromptGenerator',
  description:
    'Generate educational content with progressive complexity and optional examples',
  func: dynamicPromptGenerator,
  tags: ['education', 'content', 'progressive', 'examples'],
})
