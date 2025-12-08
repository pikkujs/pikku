import {
  wireMCPTool,
  wireMCPResource,
  wireMCPPrompt,
} from '#pikku'
import {
  sayHello,
  disableTool,
  calculate,
  getUserInfo,
  dynamicPromptGenerator,
  getStaticResource,
  staticPromptGenerator,
} from './mcp.functions.js'

// Register a simple greeting tool
wireMCPTool({
  name: 'sayHello',
  description: 'Greet someone with a friendly hello message',
  func: sayHello,
  tags: ['greeting', 'hello', 'demo'],
})

// Disable tools
wireMCPTool({
  name: 'disableTool',
  description: 'Disable a tool by name',
  func: disableTool,
  tags: [],
})

// Register a calculator tool
wireMCPTool({
  name: 'calculate',
  description:
    'Perform basic mathematical operations (add, subtract, multiply, divide)',
  func: calculate,
  tags: ['math', 'calculator', 'arithmetic'],
})

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

// Register a progressive enhancement example prompt
wireMCPPrompt({
  name: 'dynamicPromptGenerator',
  description:
    'Generate educational content with progressive complexity and optional examples',
  func: dynamicPromptGenerator,
  tags: ['education', 'content', 'progressive', 'examples'],
})
