/**
 * User Management Functions
 * Mock implementations for user CRUD, invites, and verification
 */

import { pikkuSessionlessFunc } from '#pikku'

// User CRUD
export const userCreate = pikkuSessionlessFunc<
  { email: string; name: string; role?: string },
  {
    id: string
    email: string
    name: string
    role: string
    status: string
    createdAt: string
  }
>({
  title: 'Create User',
  func: async ({ logger }, data) => {
    logger.info(`Creating user: ${data.email}`)
    return {
      id: `user-${Date.now()}`,
      email: data.email,
      name: data.name,
      role: data.role || 'member',
      status: 'pending_verification',
      createdAt: new Date().toISOString(),
    }
  },
})

export const userGet = pikkuSessionlessFunc<
  { userId: string },
  { id: string; email: string; name: string; role: string; status: string }
>({
  title: 'Get User',
  func: async ({ logger }, data) => {
    logger.info(`Getting user: ${data.userId}`)
    return {
      id: data.userId,
      email: `user-${data.userId}@example.com`,
      name: `User ${data.userId}`,
      role: 'member',
      status: 'active',
    }
  },
})

export const userUpdate = pikkuSessionlessFunc<
  { userId: string; name?: string; role?: string; status?: string },
  { id: string; name: string; role: string; status: string; updatedAt: string }
>({
  title: 'Update User',
  func: async ({ logger }, data) => {
    logger.info(`Updating user: ${data.userId}`)
    return {
      id: data.userId,
      name: data.name || `User ${data.userId}`,
      role: data.role || 'member',
      status: data.status || 'active',
      updatedAt: new Date().toISOString(),
    }
  },
})

export const userDelete = pikkuSessionlessFunc<
  { userId: string },
  { deleted: boolean; userId: string }
>({
  title: 'Delete User',
  func: async ({ logger }, data) => {
    logger.info(`Deleting user: ${data.userId}`)
    return {
      deleted: true,
      userId: data.userId,
    }
  },
})

export const userList = pikkuSessionlessFunc<
  { role?: string; status?: string; limit?: number },
  {
    users: Array<{
      id: string
      email: string
      name: string
      role: string
      status: string
    }>
  }
>({
  title: 'List Users',
  func: async ({ logger }, data) => {
    logger.info(`Listing users with role: ${data.role}, status: ${data.status}`)
    return {
      users: [
        {
          id: 'user-1',
          email: 'alice@example.com',
          name: 'Alice',
          role: 'admin',
          status: 'active',
        },
        {
          id: 'user-2',
          email: 'bob@example.com',
          name: 'Bob',
          role: 'member',
          status: 'active',
        },
        {
          id: 'user-3',
          email: 'charlie@example.com',
          name: 'Charlie',
          role: 'member',
          status: 'pending_verification',
        },
      ],
    }
  },
})

// User Invites
export const userInvite = pikkuSessionlessFunc<
  { email: string; role: string; invitedBy: string },
  {
    id: string
    email: string
    role: string
    invitedBy: string
    token: string
    expiresAt: string
  }
>({
  title: 'Invite User',
  func: async ({ logger }, data) => {
    logger.info(`Inviting user: ${data.email}`)
    return {
      id: `invite-${Date.now()}`,
      email: data.email,
      role: data.role,
      invitedBy: data.invitedBy,
      token: `token-${Date.now()}`,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }
  },
})

export const userInviteAccept = pikkuSessionlessFunc<
  { token: string; name: string; password: string },
  { userId: string; email: string; name: string; status: string }
>({
  title: 'Accept User Invite',
  func: async ({ logger }, data) => {
    logger.info(`Accepting invite with token: ${data.token}`)
    return {
      userId: `user-${Date.now()}`,
      email: 'invited@example.com',
      name: data.name,
      status: 'active',
    }
  },
})

// User Verification
export const userVerify = pikkuSessionlessFunc<
  { userId: string; token: string },
  { userId: string; verified: boolean; verifiedAt: string }
>({
  title: 'Verify User',
  func: async ({ logger }, data) => {
    logger.info(`Verifying user: ${data.userId}`)
    return {
      userId: data.userId,
      verified: true,
      verifiedAt: new Date().toISOString(),
    }
  },
})

export const userSendVerificationEmail = pikkuSessionlessFunc<
  { userId: string; email: string },
  { sent: boolean; token: string; expiresAt: string }
>({
  title: 'Send Verification Email',
  func: async ({ logger }, data) => {
    logger.info(`Sending verification email to: ${data.email}`)
    return {
      sent: true,
      token: `verify-${Date.now()}`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }
  },
})

// Profile
export const profileSetup = pikkuSessionlessFunc<
  { userId: string; avatar?: string; bio?: string; timezone?: string },
  {
    userId: string
    avatar?: string
    bio?: string
    timezone: string
    setupAt: string
  }
>({
  title: 'Setup Profile',
  func: async ({ logger }, data) => {
    logger.info(`Setting up profile for user: ${data.userId}`)
    return {
      userId: data.userId,
      avatar: data.avatar,
      bio: data.bio,
      timezone: data.timezone || 'UTC',
      setupAt: new Date().toISOString(),
    }
  },
})
