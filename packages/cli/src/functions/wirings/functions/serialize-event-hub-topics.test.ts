import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import {
  collectEventHubTopicPatterns,
  serializeEventHubTopics,
} from './serialize-event-hub-topics.js'

describe('serializeEventHubTopics', () => {
  test('collects each declared pattern once, in stable order', () => {
    assert.deepEqual(
      collectEventHubTopicPatterns({
        a: { subscribe: { topicPattern: 'order:${string}' } },
        b: { subscribe: { topicPattern: 'news' } },
        c: { subscribe: { topicPattern: 'order:${string}' } },
        d: {},
      }),
      ['news', 'order:${string}']
    )
  })

  test('emits a union of literals and templates', () => {
    const out = serializeEventHubTopics(['news', 'order:${string}'])
    assert.match(
      out,
      /export type EventHubTopic = "news" \| `order:\$\{string\}`/
    )
  })

  test('is never when nothing subscribes', () => {
    assert.match(serializeEventHubTopics([]), /EventHubTopic = never/)
  })
})
