import { pikkuCLIRender } from '@pikku/core'

// Render functions for different command outputs
export const jsonRenderer = pikkuCLIRender((_services, output: any) => {
  console.log(JSON.stringify(output, null, 2))
})

export const userRenderer = pikkuCLIRender((_services, output: any) => {
  if (output.users) {
    // List users output
    console.log(`Found ${output.total} users:`)
    output.users.forEach((user: any) => {
      const role = user.admin ? 'admin' : 'user'
      console.log(`  ${user.id}: ${user.username} (${user.email}) [${role}]`)
    })
  } else {
    // Single user output
    const role = output.admin ? 'admin' : 'user'
    console.log(`Created user: ${output.username} (${output.email}) [${role}]`)
    console.log(`User ID: ${output.id}`)
  }
})

export const greetRenderer = pikkuCLIRender<{
  message: string
  timestamp: string
}>((_services, output) => {
  console.log(output.message)
  console.log(`Generated at: ${output.timestamp}`)
})

export const calcRenderer = pikkuCLIRender<{
  expression: string
  result: number
}>((_services, output) => {
  console.log(`Expression: ${output.expression}`)
  console.log(`Result: ${output.result}`)
})

export const fileRenderer = pikkuCLIRender<{
  path: string
  action: string
  backup: boolean
  processed: boolean
  timestamp: string
  size: number
}>((_services, output) => {
  console.log(`File: ${output.path}`)
  console.log(`Action: ${output.action}`)
  console.log(`Size: ${output.size} bytes`)
  if (output.backup) {
    console.log('Backup created: Yes')
  }
  console.log(`Processed at: ${output.timestamp}`)
})
