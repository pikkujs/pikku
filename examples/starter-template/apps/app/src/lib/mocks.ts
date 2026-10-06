import { registerMocks } from '@project/functions-sdk/pikku/api.gen'

if (import.meta.env.DEV || import.meta.env.VITE_MOCK) {
  registerMocks(
    import.meta.glob('../../../../.mocks/**/*.json'),
    import.meta.glob('../../../../.mocks/**/*.meta.json', { eager: true }),
  )
}
