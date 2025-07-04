import { addMCPEndpoint } from '../.pikku/pikku-types.gen.js'
import { sayHello, calculate, getUserInfo } from './mcp.functions.js'

// Register a simple greeting tool
addMCPEndpoint({
  name: 'sayHello',
  description: 'Greet someone with a friendly hello message',
  type: 'tool',
  func: sayHello,
  docs: {
    summary: 'Say hello to someone',
    description:
      'A simple greeting tool that returns a personalized hello message with timestamp',
    tags: ['greeting', 'hello', 'demo'],
  },
})

// Register a calculator tool
addMCPEndpoint({
  name: 'calculate',
  description:
    'Perform basic mathematical operations (add, subtract, multiply, divide)',
  type: 'tool',
  func: calculate,
  docs: {
    summary: 'Basic calculator',
    description: 'Performs basic arithmetic operations between two numbers',
    tags: ['math', 'calculator', 'arithmetic'],
  },
})

// Register a user information resource
addMCPEndpoint({
  name: 'getUserInfo',
  description: 'Retrieve user information by user ID',
  type: 'resource',
  func: getUserInfo,
  docs: {
    summary: 'Get user data',
    description:
      'Fetches user profile information including name, email, and last login',
    tags: ['user', 'profile', 'data'],
  },
})
