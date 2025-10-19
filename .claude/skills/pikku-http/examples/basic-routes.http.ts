import { wireHTTP } from './pikku-types.gen.js'
import { getCard, listCards, createCard } from './functions/board.function.js'

/**
 * Basic HTTP GET route with path parameter
 * GET /v1/cards/:cardId
 */
wireHTTP({
  method: 'get',
  route: '/v1/cards/:cardId',
  func: getCard,
})

/**
 * Basic HTTP GET route for listing
 * GET /v1/cards?limit=10&offset=0
 */
wireHTTP({
  method: 'get',
  route: '/v1/cards',
  func: listCards,
})

/**
 * Basic HTTP POST route
 * POST /v1/cards
 * Body: { title: string, description: string }
 */
wireHTTP({
  method: 'post',
  route: '/v1/cards',
  func: createCard,
})
