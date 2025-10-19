import { wireHTTP } from '../../.pikku/pikku-types.gen.js'
import { saveData } from './save-data.function.js'

wireHTTP({
  method: 'post',
  route: '/api/storage/save',
  tags: ['storage'],
  func: saveData,
})
