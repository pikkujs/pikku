/**
 * Declarative mapping of n8n integration nodes onto per-service Pikku addon
 * functions (the ones generated into `addons/packages/<category>/<service>`).
 *
 * Where `native-map` targets the always-present `@pikku/addon-graph` builtins,
 * this table targets an external addon rpc (`google-drive:filesGet`) selected by
 * the node's n8n `resource` + `operation`. Both share the `NativeNodeSpec` shape
 * and the `role='native'` emission path, so a matched integration node emits a
 * real addon call with a 1:1 field mapping — not a throwing stub.
 *
 * A resource/operation absent from a service's table stays a stub + manifest
 * entry (addon-map skill territory), so partial coverage degrades gracefully.
 */

import type { NativeFieldSpec, NativeNodeSpec } from './native-map.js'

interface ResourceMap {
  /** Operation n8n omits from the JSON when it's the resource's default. */
  defaultOperation: string
  operations: Record<string, NativeNodeSpec>
}

interface IntegrationNodeMap {
  /** Resource n8n omits from the JSON when it's the node's default. */
  defaultResource: string
  resources: Record<string, ResourceMap>
  /**
   * n8n parameter that carries the operation selector. Defaults to `operation`;
   * the text nodes (xml / markdown) use `mode` instead.
   */
  operationParam?: string
}

const GOOGLE_DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder'

const HTML_EXTRACT_OP: NativeNodeSpec = {
  rpc: 'html-extract:htmlExtract',
  fields: {
    html: {
      fromPredecessorPath: { param: 'dataPropertyName', default: 'data' },
    },
    extractions: {
      fromCollection: {
        path: 'extractionValues.values',
        map: {
          key: 'key',
          cssSelector: 'cssSelector',
          returnValue: 'returnValue',
          attribute: 'attribute',
          returnArray: 'returnArray',
        },
      },
    },
  },
}

// extractFromFile carries the file's bytes inline as base64 at the item's
// `binaryPropertyName` (n8n default `data`) — the shared source for every
// file-type parse operation.
const EXTRACT_BINARY_SOURCE: NativeFieldSpec = {
  fromPredecessorPath: { param: 'binaryPropertyName', default: 'data' },
}

// n8n Merge combine-family modes join the input branches' objects into one —
// exactly graph:merge (shallow-merge, later overrides), fed by ALL predecessors.
// chooseBranch / combineBySql / removeKeyMatches are a different shape → stub.
const MERGE_COMBINE: NativeNodeSpec = {
  rpc: 'graph:merge',
  fields: { items: { fromAllPredecessors: true } },
}

// n8n Merge `append` concatenates the input branches' item streams into one →
// graph:concat over all predecessors. append is also the node's zero-config
// default (combine modes require field/position config), so a mode-less Merge
// resolves here too via `defaultOperation`.
const MERGE_APPEND: NativeNodeSpec = {
  rpc: 'graph:concat',
  fields: { inputs: { fromAllPredecessors: true } },
}

const INTEGRATION_NODES: Record<string, IntegrationNodeMap> = {
  merge: {
    operationParam: 'mode',
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'append',
        operations: {
          append: MERGE_APPEND,
          combine: MERGE_COMBINE,
          mergeByKey: MERGE_COMBINE,
          mergeByIndex: MERGE_COMBINE,
          mergeByPropertyName: MERGE_COMBINE,
        },
      },
    },
  },
  googledrive: {
    defaultResource: 'file',
    resources: {
      file: {
        defaultOperation: 'upload',
        operations: {
          download: {
            // NOTE: the Drive v3 OpenAPI restricts `alt` to `"json"`, so the
            // spec-derived addon can't express `alt=media` (raw media download).
            // Mapped to metadata get; media download is an addon-completeness gap.
            rpc: 'google-drive:filesGet',
            fields: {
              fileId: { fromRL: 'fileId' },
            },
          },
          upload: {
            rpc: 'google-drive:filesCreate',
            fields: {
              name: { from: 'name' },
              parents: { fromRL: 'folderId' },
            },
          },
          createFromText: {
            rpc: 'google-drive:filesCreate',
            fields: {
              name: { from: 'name' },
              parents: { fromRL: 'folderId' },
            },
          },
          copy: {
            rpc: 'google-drive:filesCopy',
            fields: {
              fileId: { fromRL: 'fileId' },
              name: { from: 'name' },
            },
          },
          move: {
            rpc: 'google-drive:filesUpdate',
            fields: {
              fileId: { fromRL: 'fileId' },
              addParents: { fromRL: 'folderId' },
            },
          },
          update: {
            rpc: 'google-drive:filesUpdate',
            fields: {
              fileId: { fromRL: 'fileId' },
              name: { from: 'newUpdatedFileName' },
            },
          },
          deleteFile: {
            rpc: 'google-drive:filesDelete',
            fields: {
              fileId: { fromRL: 'fileId' },
            },
          },
          share: {
            rpc: 'google-drive:permissionsCreate',
            fields: {
              fileId: { fromRL: 'fileId' },
              role: { from: 'role', default: 'reader' },
              type: { from: 'type', default: 'user' },
              emailAddress: { from: 'emailAddress' },
            },
          },
        },
      },
      folder: {
        defaultOperation: 'create',
        operations: {
          create: {
            rpc: 'google-drive:filesCreate',
            fields: {
              name: { from: 'name' },
              mimeType: { default: GOOGLE_DRIVE_FOLDER_MIME, asConst: true },
              parents: { fromRL: 'folderId' },
            },
          },
          deleteFolder: {
            rpc: 'google-drive:filesDelete',
            fields: {
              fileId: { fromRL: 'folderId' },
            },
          },
          share: {
            rpc: 'google-drive:permissionsCreate',
            fields: {
              fileId: { fromRL: 'folderId' },
              role: { from: 'role', default: 'reader' },
              type: { from: 'type', default: 'user' },
              emailAddress: { from: 'emailAddress' },
            },
          },
        },
      },
      drive: {
        defaultOperation: 'create',
        operations: {
          create: {
            rpc: 'google-drive:drivesCreate',
            fields: {
              name: { from: 'name' },
            },
          },
          deleteDrive: {
            rpc: 'google-drive:drivesDelete',
            fields: {
              driveId: { fromRL: 'driveId' },
            },
          },
          get: {
            rpc: 'google-drive:drivesGet',
            fields: {
              driveId: { fromRL: 'driveId' },
            },
          },
          list: {
            rpc: 'google-drive:drivesList',
            fields: {},
          },
          update: {
            rpc: 'google-drive:drivesUpdate',
            fields: {
              driveId: { fromRL: 'driveId' },
              name: { from: 'name' },
            },
          },
        },
      },
      fileFolder: {
        defaultOperation: 'search',
        operations: {
          search: {
            rpc: 'google-drive:filesList',
            fields: {
              q: { from: 'queryString' },
            },
          },
        },
      },
    },
  },
  googlesheets: {
    defaultResource: 'sheet',
    resources: {
      sheet: {
        defaultOperation: 'read',
        operations: {
          // NOTE: n8n's `sheetName` resource-locator often carries a `gid=N`
          // value rather than an A1 sheet name; the Sheets API wants A1. The
          // gid→name resolution is an addon-completeness detail (addon-map step).
          append: {
            rpc: 'google-sheets:valuesAppend',
            fields: {
              spreadsheetId: { fromRL: 'documentId' },
              range: { fromRL: 'sheetName' },
            },
          },
          read: {
            rpc: 'google-sheets:readRows',
            collection: true,
            fields: {
              spreadsheetId: { fromRL: 'documentId' },
              range: { fromRL: 'sheetName' },
            },
          },
          update: {
            rpc: 'google-sheets:valuesUpdate',
            fields: {
              spreadsheetId: { fromRL: 'documentId' },
              range: { fromRL: 'sheetName' },
            },
          },
          appendOrUpdate: {
            rpc: 'google-sheets:valuesUpdate',
            fields: {
              spreadsheetId: { fromRL: 'documentId' },
              range: { fromRL: 'sheetName' },
            },
          },
          clear: {
            rpc: 'google-sheets:valuesClear',
            fields: {
              spreadsheetId: { fromRL: 'documentId' },
              range: { fromRL: 'sheetName' },
            },
          },
        },
      },
      spreadsheet: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'google-sheets:create', fields: {} },
        },
      },
    },
  },
  slack: {
    defaultResource: 'message',
    resources: {
      message: {
        defaultOperation: 'post',
        operations: {
          post: {
            rpc: 'slack:chatPostMessage',
            fields: {
              channel: { fromRL: ['channelId', 'channel'] },
              text: { from: 'text' },
            },
          },
        },
      },
    },
  },
  googlecalendar: {
    defaultResource: 'event',
    resources: {
      event: {
        defaultOperation: 'create',
        operations: {
          create: {
            rpc: 'google-calendar:eventsInsert',
            fields: {
              calendarId: { fromRL: 'calendar' },
            },
          },
          getAll: {
            rpc: 'google-calendar:eventsList',
            fields: {
              calendarId: { fromRL: 'calendar' },
            },
          },
          update: {
            rpc: 'google-calendar:eventsUpdate',
            fields: {
              calendarId: { fromRL: 'calendar' },
              eventId: { fromRL: 'eventId' },
            },
          },
          get: {
            rpc: 'google-calendar:eventsGet',
            fields: {
              calendarId: { fromRL: 'calendar' },
              eventId: { fromRL: 'eventId' },
            },
          },
          delete: {
            rpc: 'google-calendar:eventsDelete',
            fields: {
              calendarId: { fromRL: 'calendar' },
              eventId: { fromRL: 'eventId' },
            },
          },
        },
      },
    },
  },
  notion: {
    defaultResource: 'page',
    resources: {
      databasePage: {
        defaultOperation: 'create',
        operations: {
          // NOTE: page create/update bodies (parent + properties) are nested n8n
          // collections not mapped here; the rpc wires, body is refinement work.
          create: { rpc: 'notion:postPage', fields: {} },
          getAll: {
            rpc: 'notion:postDatabaseQuery',
            fields: {
              data_source_id: { fromRL: 'databaseId' },
            },
          },
          update: {
            rpc: 'notion:patchPage',
            fields: {
              page_id: { fromRL: 'pageId' },
            },
          },
          get: {
            rpc: 'notion:retrieveAPage',
            fields: {
              page_id: { fromRL: 'pageId' },
            },
          },
        },
      },
      database: {
        defaultOperation: 'get',
        operations: {
          get: {
            rpc: 'notion:retrieveDatabase',
            fields: {
              database_id: { fromRL: 'databaseId' },
            },
          },
        },
      },
      block: {
        defaultOperation: 'append',
        operations: {
          getAll: {
            rpc: 'notion:getBlockChildren',
            fields: {
              block_id: { fromRL: 'blockId' },
            },
          },
          append: {
            rpc: 'notion:patchBlockChildren',
            fields: {
              block_id: { fromRL: 'blockId' },
            },
          },
        },
      },
      page: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'notion:postPage', fields: {} },
        },
      },
    },
  },
  telegram: {
    // The n8n Telegram node has no `resource`, only an `operation`; the single
    // `message` resource carries them all.
    defaultResource: 'message',
    resources: {
      message: {
        defaultOperation: 'sendMessage',
        operations: {
          sendMessage: {
            rpc: 'telegram:messageSend',
            fields: { chat_id: { from: 'chatId' }, text: { from: 'text' } },
          },
          editMessageText: {
            rpc: 'telegram:messageEdit',
            fields: { chat_id: { from: 'chatId' }, text: { from: 'text' } },
          },
          deleteMessage: {
            rpc: 'telegram:messageDelete',
            fields: { chat_id: { from: 'chatId' } },
          },
          sendPhoto: {
            rpc: 'telegram:messageSendPhoto',
            fields: { chat_id: { from: 'chatId' } },
          },
          sendDocument: {
            rpc: 'telegram:messageSendDocument',
            fields: { chat_id: { from: 'chatId' } },
          },
          sendChatAction: {
            rpc: 'telegram:messageSendChatAction',
            fields: { chat_id: { from: 'chatId' } },
          },
          sendLocation: {
            rpc: 'telegram:messageSendLocation',
            fields: { chat_id: { from: 'chatId' } },
          },
          sendMediaGroup: {
            rpc: 'telegram:messageSendMediaGroup',
            fields: { chat_id: { from: 'chatId' } },
          },
        },
      },
    },
  },
  airtable: {
    defaultResource: 'record',
    resources: {
      record: {
        defaultOperation: 'search',
        operations: {
          create: {
            rpc: 'airtable:createRecord',
            fields: {
              baseId: { fromRL: ['base', 'application'] },
              tableId: { fromRL: 'table' },
            },
          },
          append: {
            rpc: 'airtable:createRecord',
            fields: {
              baseId: { fromRL: ['base', 'application'] },
              tableId: { fromRL: 'table' },
            },
          },
          list: {
            rpc: 'airtable:listRecordItems',
            collection: true,
            fields: {
              baseId: { fromRL: ['base', 'application'] },
              tableId: { fromRL: 'table' },
            },
          },
          search: {
            rpc: 'airtable:listRecordItems',
            collection: true,
            fields: {
              baseId: { fromRL: ['base', 'application'] },
              tableId: { fromRL: 'table' },
            },
          },
          read: {
            rpc: 'airtable:getRecord',
            fields: {
              baseId: { fromRL: ['base', 'application'] },
              tableId: { fromRL: 'table' },
              recordId: { fromRL: ['id', 'recordId'] },
            },
          },
          get: {
            rpc: 'airtable:getRecord',
            fields: {
              baseId: { fromRL: ['base', 'application'] },
              tableId: { fromRL: 'table' },
              recordId: { fromRL: ['id', 'recordId'] },
            },
          },
          update: {
            rpc: 'airtable:updateRecord',
            fields: {
              baseId: { fromRL: ['base', 'application'] },
              tableId: { fromRL: 'table' },
              recordId: { fromRL: ['id', 'recordId'] },
            },
          },
          deleteRecord: {
            rpc: 'airtable:deleteRecord',
            fields: {
              baseId: { fromRL: ['base', 'application'] },
              tableId: { fromRL: 'table' },
              recordId: { fromRL: ['id', 'recordId'] },
            },
          },
        },
      },
    },
  },
  redis: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'redis:keyGet', fields: { key: { from: 'key' } } },
          set: {
            rpc: 'redis:keySet',
            fields: { key: { from: 'key' }, value: { from: 'value' } },
          },
          delete: { rpc: 'redis:keyDelete', fields: { key: { from: 'key' } } },
          incr: { rpc: 'redis:keyIncr', fields: { key: { from: 'key' } } },
          keys: {
            rpc: 'redis:keys',
            fields: { pattern: { from: 'keyPattern' } },
          },
          publish: {
            rpc: 'redis:publish',
            fields: { channel: { from: 'channel' } },
          },
        },
      },
    },
  },
  postgres: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'executeQuery',
        operations: {
          executeQuery: {
            rpc: 'postgres:executeQuery',
            fields: { query: { from: 'query' } },
          },
          insert: {
            rpc: 'postgres:insert',
            fields: { table: { fromRL: 'table' } },
          },
          update: {
            rpc: 'postgres:update',
            fields: { table: { fromRL: 'table' } },
          },
          select: {
            rpc: 'postgres:select',
            fields: { table: { fromRL: 'table' } },
          },
          upsert: {
            rpc: 'postgres:upsert',
            fields: { table: { fromRL: 'table' } },
          },
          delete: {
            rpc: 'postgres:deleteRows',
            fields: { table: { fromRL: 'table' } },
          },
        },
      },
    },
  },
  mysql: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'executeQuery',
        operations: {
          executeQuery: {
            rpc: 'mysql:executeQuery',
            fields: { query: { from: 'query' } },
          },
          insert: {
            rpc: 'mysql:insert',
            fields: { table: { fromRL: 'table' } },
          },
          update: {
            rpc: 'mysql:update',
            fields: { table: { fromRL: 'table' } },
          },
          select: {
            rpc: 'mysql:select',
            fields: { table: { fromRL: 'table' } },
          },
          upsert: {
            rpc: 'mysql:upsert',
            fields: { table: { fromRL: 'table' } },
          },
          delete: {
            rpc: 'mysql:deleteRows',
            fields: { table: { fromRL: 'table' } },
          },
        },
      },
    },
  },
  supabase: {
    defaultResource: 'row',
    resources: {
      row: {
        defaultOperation: 'getAll',
        operations: {
          create: {
            rpc: 'supabase:insertRows',
            fields: { table: { fromRL: 'tableId' } },
          },
          getAll: {
            rpc: 'supabase:selectRows',
            fields: { table: { fromRL: 'tableId' } },
          },
          get: {
            rpc: 'supabase:selectRows',
            fields: { table: { fromRL: 'tableId' } },
          },
          update: {
            rpc: 'supabase:updateRows',
            fields: { table: { fromRL: 'tableId' } },
          },
          delete: {
            rpc: 'supabase:deleteRows',
            fields: { table: { fromRL: 'tableId' } },
          },
        },
      },
    },
  },
  mongodb: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'find',
        operations: {
          find: {
            rpc: 'mongodb:mongoFind',
            fields: { collection: { from: 'collection' } },
          },
          insert: {
            rpc: 'mongodb:mongoInsertMany',
            fields: { collection: { from: 'collection' } },
          },
          update: {
            rpc: 'mongodb:mongoUpdateMany',
            fields: { collection: { from: 'collection' } },
          },
          delete: {
            rpc: 'mongodb:mongoDeleteMany',
            fields: { collection: { from: 'collection' } },
          },
          aggregate: {
            rpc: 'mongodb:mongoAggregate',
            fields: { collection: { from: 'collection' } },
          },
        },
      },
    },
  },
  openai: {
    // n8n's OpenAI node is a wide resource/operation matrix with nested message
    // collections; wire the two dominant paths by rpc + model/prompt only.
    defaultResource: 'text',
    resources: {
      text: {
        defaultOperation: 'message',
        operations: {
          message: {
            rpc: 'openai:chatComplete',
            fields: { model: { fromRL: 'model' } },
          },
          complete: {
            rpc: 'openai:chatComplete',
            fields: { model: { fromRL: 'model' } },
          },
        },
      },
      image: {
        defaultOperation: 'generate',
        operations: {
          generate: {
            rpc: 'openai:imageCreate',
            fields: { prompt: { from: 'prompt' } },
          },
        },
      },
    },
  },
  emailsend: {
    defaultResource: 'email',
    resources: {
      email: {
        defaultOperation: 'send',
        operations: {
          send: {
            rpc: 'email-send:emailSend',
            fields: {
              subject: { from: 'subject' },
              text: { from: 'text' },
            },
          },
        },
      },
    },
  },
  gmail: {
    defaultResource: 'message',
    resources: {
      message: {
        defaultOperation: 'send',
        operations: {
          send: {
            // NOTE: the addon's `to` is a structured `[{ email, name? }]` array;
            // n8n's `sendTo` is a comma-separated string. Shape conversion is
            // addon-map-step territory, so recipients aren't mapped here.
            rpc: 'gmail:messageSend',
            fields: {
              subject: { from: 'subject' },
              body: { from: 'message' },
            },
          },
          reply: {
            rpc: 'gmail:messageReply',
            fields: {
              messageId: { from: 'messageId' },
              body: { from: 'message' },
            },
          },
          get: {
            rpc: 'gmail:messageGet',
            fields: { id: { from: 'messageId' } },
          },
          getAll: { rpc: 'gmail:messageList', fields: {} },
          delete: {
            rpc: 'gmail:messageDelete',
            fields: { id: { from: 'messageId' } },
          },
          markAsRead: {
            rpc: 'gmail:messageMarkRead',
            fields: { id: { from: 'messageId' } },
          },
          markAsUnread: {
            rpc: 'gmail:messageMarkUnread',
            fields: { id: { from: 'messageId' } },
          },
          addLabels: {
            rpc: 'gmail:messageAddLabel',
            fields: { id: { from: 'messageId' } },
          },
          removeLabels: {
            rpc: 'gmail:messageRemoveLabel',
            fields: { id: { from: 'messageId' } },
          },
        },
      },
      label: {
        defaultOperation: 'getAll',
        operations: {
          create: {
            rpc: 'gmail:labelCreate',
            fields: { name: { from: 'name' } },
          },
          delete: {
            rpc: 'gmail:labelDelete',
            fields: { id: { from: 'labelId' } },
          },
          get: { rpc: 'gmail:labelGet', fields: { id: { from: 'labelId' } } },
          getAll: { rpc: 'gmail:labelList', fields: {} },
        },
      },
      draft: {
        defaultOperation: 'create',
        operations: {
          create: {
            rpc: 'gmail:draftCreate',
            fields: {
              subject: { from: 'subject' },
              body: { from: 'message' },
            },
          },
          delete: {
            rpc: 'gmail:draftDelete',
            fields: { id: { from: 'messageId' } },
          },
          get: { rpc: 'gmail:draftGet', fields: { id: { from: 'messageId' } } },
          getAll: { rpc: 'gmail:draftList', fields: {} },
        },
      },
      thread: {
        defaultOperation: 'getAll',
        operations: {
          get: { rpc: 'gmail:threadGet', fields: { id: { from: 'threadId' } } },
          getAll: { rpc: 'gmail:threadList', fields: {} },
          delete: {
            rpc: 'gmail:threadDelete',
            fields: { id: { from: 'threadId' } },
          },
          reply: {
            rpc: 'gmail:threadReply',
            fields: {
              threadId: { from: 'threadId' },
              body: { from: 'message' },
            },
          },
          trash: {
            rpc: 'gmail:threadTrash',
            fields: { id: { from: 'threadId' } },
          },
          untrash: {
            rpc: 'gmail:threadUntrash',
            fields: { id: { from: 'threadId' } },
          },
          addLabels: {
            rpc: 'gmail:threadAddLabel',
            fields: { id: { from: 'threadId' } },
          },
          removeLabels: {
            rpc: 'gmail:threadRemoveLabel',
            fields: { id: { from: 'threadId' } },
          },
        },
      },
    },
  },
  discord: {
    defaultResource: 'message',
    resources: {
      message: {
        defaultOperation: 'send',
        operations: {
          send: {
            rpc: 'discord:messageSend',
            fields: {
              channel_id: { fromRL: ['channelId', 'channel'] },
              content: { from: 'content' },
            },
          },
        },
      },
    },
  },
  whatsapp: {
    defaultResource: 'message',
    resources: {
      message: {
        defaultOperation: 'send',
        operations: {
          send: {
            rpc: 'whatsapp:messagesSend',
            fields: { to: { from: 'recipientPhoneNumber' } },
          },
        },
      },
    },
  },
  twilio: {
    defaultResource: 'sms',
    resources: {
      sms: {
        defaultOperation: 'send',
        operations: {
          send: {
            rpc: 'twilio:smsSend',
            fields: {
              From: { from: 'from' },
              To: { from: 'to' },
              Body: { from: 'message' },
            },
          },
        },
      },
    },
  },
  rssfeedread: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'read',
        operations: {
          read: {
            rpc: 'rss-feed:rssFeedRead',
            fields: { url: { from: 'url' } },
          },
        },
      },
    },
  },
  googleanalytics: {
    defaultResource: 'report',
    resources: {
      report: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'google-analytics:reportRun', fields: {} },
          getReport: { rpc: 'google-analytics:reportRun', fields: {} },
        },
      },
    },
  },
  hubspot: {
    defaultResource: 'contact',
    resources: {
      contact: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'hubspot:contactUpsert', fields: {} },
          upsert: { rpc: 'hubspot:contactUpsert', fields: {} },
          update: { rpc: 'hubspot:contactUpsert', fields: {} },
          get: { rpc: 'hubspot:contactGet', fields: {} },
          getAll: { rpc: 'hubspot:contactList', fields: {} },
          search: { rpc: 'hubspot:contactSearch', fields: {} },
          delete: { rpc: 'hubspot:contactDelete', fields: {} },
        },
      },
      company: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'hubspot:companyCreate', fields: {} },
          get: { rpc: 'hubspot:companyGet', fields: {} },
          getAll: { rpc: 'hubspot:companyList', fields: {} },
          update: { rpc: 'hubspot:companyUpdate', fields: {} },
          delete: { rpc: 'hubspot:companyDelete', fields: {} },
        },
      },
      deal: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'hubspot:dealCreate', fields: {} },
          get: { rpc: 'hubspot:dealGet', fields: {} },
          getAll: { rpc: 'hubspot:dealList', fields: {} },
          update: { rpc: 'hubspot:dealUpdate', fields: {} },
          delete: { rpc: 'hubspot:dealDelete', fields: {} },
        },
      },
      ticket: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'hubspot:ticketCreate', fields: {} },
          get: { rpc: 'hubspot:ticketGet', fields: {} },
          getAll: { rpc: 'hubspot:ticketList', fields: {} },
          update: { rpc: 'hubspot:ticketUpdate', fields: {} },
          delete: { rpc: 'hubspot:ticketDelete', fields: {} },
        },
      },
    },
  },
  html: {
    // n8n's HTML node extracts via CSS selectors (→ the html-extract addon) or
    // converts to a table (→ the html addon). The default "generate HTML
    // template" op has no addon target, so defaultOperation points at an
    // unmapped key → those nodes degrade to a stub rather than mis-map.
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'generateHtmlTemplate',
        operations: {
          extractHtmlContent: HTML_EXTRACT_OP,
          convertToHtmlTable: {
            rpc: 'html:htmlToTable',
            fields: { data: { fromPredecessor: true } },
          },
        },
      },
    },
  },
  markdown: {
    // Direction selected by `mode` (default htmlToMarkdown); source is a direct
    // expression param (`html` / `markdown`), not the incoming item stream.
    operationParam: 'mode',
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'htmlToMarkdown',
        operations: {
          markdownToHtml: {
            rpc: 'markdown:markdownToHtml',
            fields: { markdown: { from: 'markdown' } },
          },
          htmlToMarkdown: {
            rpc: 'markdown:htmlToMarkdown',
            fields: { html: { from: 'html' } },
          },
        },
      },
    },
  },
  xml: {
    // Direction selected by `mode` (default xmlToJson); the string is read from
    // the item property named by `dataPropertyName` (default `data`).
    operationParam: 'mode',
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'xmlToJson',
        operations: {
          xmlToJson: {
            rpc: 'xml:xmlToJson',
            fields: {
              xml: {
                fromPredecessorPath: {
                  param: 'dataPropertyName',
                  default: 'data',
                },
              },
            },
          },
          jsonToxml: {
            rpc: 'xml:jsonToXml',
            fields: {
              data: {
                fromPredecessorPath: {
                  param: 'dataPropertyName',
                  default: 'data',
                },
              },
            },
          },
        },
      },
    },
  },
  // n8n filesystem nodes → the graph:readFile / graph:writeFile builtins, which
  // bridge to the core content service. n8n treats these as raw binary, so the
  // content is carried base64. The file path maps to the asset `key`; bucket is
  // left to the content service's default. (glob reads — readBinaryFiles — have
  // no single-file equivalent and stay stubs.)
  readwritefile: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'read',
        operations: {
          read: {
            rpc: 'graph:readFile',
            fields: {
              key: { from: 'fileSelector' },
              encoding: { default: 'base64', asConst: true },
            },
          },
          write: {
            rpc: 'graph:writeFile',
            fields: {
              key: { from: 'fileName' },
              data: {
                fromPredecessorPath: {
                  param: 'dataPropertyName',
                  default: 'data',
                },
              },
              encoding: { default: 'base64', asConst: true },
            },
          },
        },
      },
    },
  },
  readbinaryfile: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'read',
        operations: {
          read: {
            rpc: 'graph:readFile',
            fields: {
              key: { from: 'filePath' },
              encoding: { default: 'base64', asConst: true },
            },
          },
        },
      },
    },
  },
  writebinaryfile: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'write',
        operations: {
          write: {
            rpc: 'graph:writeFile',
            fields: {
              key: { from: 'fileName' },
              data: {
                fromPredecessorPath: {
                  param: 'dataPropertyName',
                  default: 'data',
                },
              },
              encoding: { default: 'base64', asConst: true },
            },
          },
        },
      },
    },
  },
  // n8n extractFromFile — a file-type multiplexer over the item's binary
  // (carried inline as base64 at `binaryPropertyName`, default `data`). Each
  // file type routes to the addon that parses it; ops with no clean single-addon
  // target (text / fromJson / binaryToProperty / xml) stay stubs.
  extractfromfile: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'unmapped',
        operations: {
          pdf: {
            rpc: 'read-pdf:readPdf',
            fields: {
              base64: EXTRACT_BINARY_SOURCE,
            },
          },
          xlsx: {
            rpc: 'spreadsheet:xlsxToJson',
            fields: { base64: EXTRACT_BINARY_SOURCE },
          },
          xls: {
            rpc: 'spreadsheet:xlsxToJson',
            fields: { base64: EXTRACT_BINARY_SOURCE },
          },
          ods: {
            rpc: 'spreadsheet:xlsxToJson',
            fields: { base64: EXTRACT_BINARY_SOURCE },
          },
        },
      },
    },
  },
  // n8n convertToFile — produces a file from item data. The spreadsheet output
  // (xlsx/csv/ods) maps to spreadsheet:jsonToXlsx; the raw toBinary/toText/toJson
  // "make an in-memory attachment" ops have no single-addon target → stubs.
  converttofile: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'unmapped',
        operations: {
          xlsx: {
            rpc: 'spreadsheet:jsonToXlsx',
            fields: { data: { fromPredecessor: true } },
          },
        },
      },
    },
  },
  spreadsheetfile: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'toFile',
        operations: {
          fromFile: {
            rpc: 'spreadsheet:xlsxToJson',
            fields: { base64: { fromPredecessor: true } },
          },
          toFile: {
            rpc: 'spreadsheet:jsonToXlsx',
            fields: { data: { fromPredecessor: true } },
          },
        },
      },
    },
  },
  emailreadimap: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'read',
        operations: {
          read: { rpc: 'imap:searchEmails', fields: {} },
        },
      },
    },
  },
  htmlextract: {
    // The legacy HTML Extract node has no resource/operation params — a single
    // behavior selected by the defaults.
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'extract',
        operations: { extract: HTML_EXTRACT_OP },
      },
    },
  },
  ssh: {
    defaultResource: 'command',
    resources: {
      command: {
        defaultOperation: 'execute',
        operations: {
          execute: {
            rpc: 'ssh:sshExecute',
            fields: { command: { from: 'command' }, cwd: { from: 'cwd' } },
          },
        },
      },
      file: {
        defaultOperation: 'upload',
        operations: {
          upload: {
            rpc: 'ssh:sshUpload',
            fields: { remotePath: { from: 'path' } },
          },
          download: {
            rpc: 'ssh:sshDownload',
            fields: { remotePath: { from: 'path' } },
          },
        },
      },
    },
  },
  compression: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'compress',
        operations: {
          compress: { rpc: 'compression:zipCompress', fields: {} },
          decompress: { rpc: 'compression:zipDecompress', fields: {} },
        },
      },
    },
  },
  hackernews: {
    defaultResource: 'article',
    resources: {
      article: {
        defaultOperation: 'get',
        operations: {
          get: {
            // NOTE: the addon's `id` is a number; n8n's `articleId` is a string.
            // Numeric coercion is addon-map-step territory, so it isn't mapped.
            rpc: 'hackernews:hnGetItem',
            fields: {},
          },
        },
      },
      all: {
        defaultOperation: 'getAll',
        operations: {
          getAll: { rpc: 'hackernews:hnGetStories', fields: {} },
        },
      },
    },
  },
  s3: {
    defaultResource: 'file',
    resources: {
      file: {
        defaultOperation: 'download',
        operations: {
          download: {
            rpc: 's3:s3GetObject',
            fields: {
              bucket: { from: 'bucketName' },
              key: { from: 'fileKey' },
            },
          },
          upload: {
            rpc: 's3:s3PutObject',
            fields: {
              bucket: { from: 'bucketName' },
              key: { from: 'fileKey' },
            },
          },
          delete: {
            rpc: 's3:s3DeleteObject',
            fields: {
              bucket: { from: 'bucketName' },
              key: { from: 'fileKey' },
            },
          },
        },
      },
      bucket: {
        defaultOperation: 'create',
        operations: {
          create: {
            rpc: 's3:s3CreateBucket',
            fields: { bucket: { from: 'name' } },
          },
          getAll: { rpc: 's3:s3ListBuckets', fields: {} },
        },
      },
    },
  },
  pagerduty: {
    defaultResource: 'incident',
    resources: {
      incident: {
        defaultOperation: 'get',
        operations: {
          get: {
            rpc: 'pagerduty:incidentsGet',
            fields: { id: { from: 'incidentId' } },
          },
          getAll: { rpc: 'pagerduty:incidentsList', fields: {} },
        },
      },
    },
  },
  stripe: {
    defaultResource: 'balance',
    resources: {
      balance: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'stripe:balanceGet', fields: {} },
        },
      },
      charge: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'stripe:chargeCreate', fields: {} },
          get: { rpc: 'stripe:chargeGet', fields: {} },
          getAll: { rpc: 'stripe:chargeList', fields: {} },
          update: { rpc: 'stripe:chargeUpdate', fields: {} },
        },
      },
      customer: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'stripe:customerCreate', fields: {} },
          delete: { rpc: 'stripe:customerDelete', fields: {} },
          get: { rpc: 'stripe:customerGet', fields: {} },
          getAll: { rpc: 'stripe:customerList', fields: {} },
          update: { rpc: 'stripe:customerUpdate', fields: {} },
        },
      },
    },
  },
  readpdf: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'read',
        operations: {
          read: { rpc: 'read-pdf:readPdf', fields: {} },
        },
      },
    },
  },
  sendgrid: {
    defaultResource: 'list',
    resources: {
      mail: {
        defaultOperation: 'send',
        operations: {
          send: { rpc: 'sendgrid:mailSend', fields: {} },
        },
      },
      contact: {
        defaultOperation: 'upsert',
        operations: {
          upsert: { rpc: 'sendgrid:contactUpsert', fields: {} },
          getAll: { rpc: 'sendgrid:contactList', fields: {} },
          get: { rpc: 'sendgrid:contactGet', fields: {} },
          delete: { rpc: 'sendgrid:contactDelete', fields: {} },
        },
      },
      list: {
        defaultOperation: 'getAll',
        operations: {
          create: {
            rpc: 'sendgrid:listCreate',
            fields: { name: { from: 'name' } },
          },
          get: { rpc: 'sendgrid:listGet', fields: {} },
          getAll: { rpc: 'sendgrid:listList', fields: {} },
          update: { rpc: 'sendgrid:listUpdate', fields: {} },
          delete: { rpc: 'sendgrid:listDelete', fields: {} },
        },
      },
    },
  },
  git: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'log',
        operations: {
          add: {
            rpc: 'git:gitAdd',
            fields: { directory: { from: 'repositoryPath' } },
          },
          clone: {
            rpc: 'git:gitClone',
            fields: {
              repoUrl: { from: 'sourceRepository' },
              directory: { from: 'repositoryPath' },
            },
          },
          commit: {
            rpc: 'git:gitCommit',
            fields: {
              directory: { from: 'repositoryPath' },
              message: { from: 'message' },
            },
          },
          fetch: {
            rpc: 'git:gitFetch',
            fields: { directory: { from: 'repositoryPath' } },
          },
          log: {
            rpc: 'git:gitLog',
            fields: { directory: { from: 'repositoryPath' } },
          },
          pull: {
            rpc: 'git:gitPull',
            fields: { directory: { from: 'repositoryPath' } },
          },
          push: {
            rpc: 'git:gitPush',
            fields: { directory: { from: 'repositoryPath' } },
          },
          status: {
            rpc: 'git:gitStatus',
            fields: { directory: { from: 'repositoryPath' } },
          },
        },
      },
    },
  },
  shopify: {
    defaultResource: 'product',
    resources: {
      order: {
        defaultOperation: 'getAll',
        operations: {
          create: { rpc: 'shopify:createOrder', fields: {} },
          get: { rpc: 'shopify:getOrder', fields: {} },
          getAll: { rpc: 'shopify:listOrders', fields: {} },
          update: { rpc: 'shopify:updateOrder', fields: {} },
          delete: { rpc: 'shopify:deleteOrder', fields: {} },
        },
      },
      product: {
        defaultOperation: 'getAll',
        operations: {
          create: { rpc: 'shopify:createProduct', fields: {} },
          get: { rpc: 'shopify:getProduct', fields: {} },
          getAll: { rpc: 'shopify:listProducts', fields: {} },
          update: { rpc: 'shopify:updateProduct', fields: {} },
          delete: { rpc: 'shopify:deleteProduct', fields: {} },
        },
      },
    },
  },
  todoist: {
    defaultResource: 'task',
    resources: {
      task: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'todoist:createTask', fields: {} },
          get: { rpc: 'todoist:getActiveTask', fields: {} },
          getAll: { rpc: 'todoist:getActiveTasks', fields: {} },
          update: { rpc: 'todoist:updateTask', fields: {} },
          delete: { rpc: 'todoist:deleteTask', fields: {} },
          close: { rpc: 'todoist:closeTask', fields: {} },
          reopen: { rpc: 'todoist:reopenTask', fields: {} },
        },
      },
      project: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'todoist:createProject', fields: {} },
          get: { rpc: 'todoist:getProject', fields: {} },
          getAll: { rpc: 'todoist:getAllProjects', fields: {} },
          update: { rpc: 'todoist:updateProject', fields: {} },
          delete: { rpc: 'todoist:deleteProject', fields: {} },
          getCollaborators: { rpc: 'todoist:getAllCollaborators', fields: {} },
        },
      },
      section: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'todoist:createSection', fields: {} },
          get: { rpc: 'todoist:getSingleSection', fields: {} },
          getAll: { rpc: 'todoist:getAllSections', fields: {} },
          update: { rpc: 'todoist:updateSection', fields: {} },
          delete: { rpc: 'todoist:deleteSection', fields: {} },
        },
      },
      label: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'todoist:createPersonalLabel', fields: {} },
          get: { rpc: 'todoist:getPersonalLabel', fields: {} },
          getAll: { rpc: 'todoist:getAllPersonalLabels', fields: {} },
          update: { rpc: 'todoist:updatePersonalLabel', fields: {} },
          delete: { rpc: 'todoist:deletePersonalLabel', fields: {} },
        },
      },
      comment: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'todoist:createComment', fields: {} },
          get: { rpc: 'todoist:getComment', fields: {} },
          getAll: { rpc: 'todoist:getAllComments', fields: {} },
          update: { rpc: 'todoist:updateComment', fields: {} },
          delete: { rpc: 'todoist:deleteComment', fields: {} },
        },
      },
    },
  },
  coingecko: {
    defaultResource: 'coin',
    resources: {
      coin: {
        defaultOperation: 'getAll',
        operations: {
          getAll: { rpc: 'coingecko:getCoinList', fields: {} },
          price: { rpc: 'coingecko:getCoinPrice', fields: {} },
          marketChart: { rpc: 'coingecko:getMarketChart', fields: {} },
        },
      },
    },
  },
  deepl: {
    defaultResource: 'language',
    resources: {
      language: {
        defaultOperation: 'translate',
        operations: {
          translate: { rpc: 'deepl:translateText', fields: {} },
        },
      },
    },
  },
  dropbox: {
    defaultResource: 'file',
    resources: {
      file: {
        defaultOperation: 'upload',
        operations: {
          copy: { rpc: 'dropbox:filesCopyV2', fields: {} },
          delete: { rpc: 'dropbox:filesDeleteV2', fields: {} },
          download: { rpc: 'dropbox:filesDownload', fields: {} },
          move: { rpc: 'dropbox:filesMoveV2', fields: {} },
          upload: { rpc: 'dropbox:filesUpload', fields: {} },
        },
      },
      folder: {
        defaultOperation: 'create',
        operations: {
          copy: { rpc: 'dropbox:filesCopyV2', fields: {} },
          create: { rpc: 'dropbox:filesCreateFolderV2', fields: {} },
          delete: { rpc: 'dropbox:filesDeleteV2', fields: {} },
          list: { rpc: 'dropbox:filesListFolder', fields: {} },
          move: { rpc: 'dropbox:filesMoveV2', fields: {} },
        },
      },
      search: {
        defaultOperation: 'query',
        operations: {
          query: { rpc: 'dropbox:filesSearch', fields: {} },
        },
      },
    },
  },
  elevenlabs: {
    defaultResource: 'audio',
    resources: {
      audio: {
        defaultOperation: 'synthesize',
        operations: {
          synthesize: { rpc: 'elevenlabs:synthesize', fields: {} },
          transcribe: { rpc: 'elevenlabs:transcribe', fields: {} },
        },
      },
    },
  },
  github: {
    defaultResource: 'issue',
    resources: {
      file: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'github:reposCreateOrUpdateFileContents', fields: {} },
          delete: { rpc: 'github:reposDeleteFile', fields: {} },
          edit: { rpc: 'github:reposCreateOrUpdateFileContents', fields: {} },
          get: { rpc: 'github:reposGetContent', fields: {} },
          list: { rpc: 'github:reposGetContent', fields: {} },
        },
      },
      issue: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'github:issuesCreate', fields: {} },
          createComment: { rpc: 'github:issuesCreateComment', fields: {} },
          edit: { rpc: 'github:issuesUpdate', fields: {} },
          get: { rpc: 'github:issuesGet', fields: {} },
          lock: { rpc: 'github:issuesLock', fields: {} },
        },
      },
      organization: {
        defaultOperation: 'getRepositories',
        operations: {
          getRepositories: { rpc: 'github:reposListForOrg', fields: {} },
          getMembers: { rpc: 'github:orgsListMembers', fields: {} },
        },
      },
      pullRequest: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'github:pullsCreate', fields: {} },
          update: { rpc: 'github:pullsUpdate', fields: {} },
          close: { rpc: 'github:pullsUpdate', fields: {} },
          reopen: { rpc: 'github:pullsUpdate', fields: {} },
          get: { rpc: 'github:pullsGet', fields: {} },
          createComment: { rpc: 'github:issuesCreateComment', fields: {} },
          editComment: { rpc: 'github:issuesUpdateComment', fields: {} },
          merge: { rpc: 'github:pullsMerge', fields: {} },
        },
      },
      release: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'github:reposCreateRelease', fields: {} },
          delete: { rpc: 'github:reposDeleteRelease', fields: {} },
          get: { rpc: 'github:reposGetRelease', fields: {} },
          getAll: { rpc: 'github:reposListReleases', fields: {} },
          update: { rpc: 'github:reposUpdateRelease', fields: {} },
        },
      },
      repository: {
        defaultOperation: 'getIssues',
        operations: {
          get: { rpc: 'github:reposGet', fields: {} },
          getIssues: { rpc: 'github:issuesListForRepo', fields: {} },
          getLicense: { rpc: 'github:licensesGetForRepo', fields: {} },
          getProfile: {
            rpc: 'github:reposGetCommunityProfileMetrics',
            fields: {},
          },
          getPullRequests: { rpc: 'github:pullsList', fields: {} },
          listPopularPaths: { rpc: 'github:reposGetTopPaths', fields: {} },
          listReferrers: { rpc: 'github:reposGetTopReferrers', fields: {} },
        },
      },
      review: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'github:pullsCreateReview', fields: {} },
          get: { rpc: 'github:pullsGetReview', fields: {} },
          getAll: { rpc: 'github:pullsListReviews', fields: {} },
          update: { rpc: 'github:pullsUpdateReview', fields: {} },
        },
      },
      user: {
        defaultOperation: 'getRepositories',
        operations: {
          getRepositories: { rpc: 'github:reposListForUser', fields: {} },
          getUserIssues: {
            rpc: 'github:issuesListForAuthenticatedUser',
            fields: {},
          },
          invite: { rpc: 'github:orgsCreateInvitation', fields: {} },
        },
      },
      workflow: {
        defaultOperation: 'dispatch',
        operations: {
          disable: { rpc: 'github:actionsDisableWorkflow', fields: {} },
          dispatch: { rpc: 'github:actionsCreateWorkflowDispatch', fields: {} },
          dispatchAndWait: {
            rpc: 'github:actionsCreateWorkflowDispatch',
            fields: {},
          },
          enable: { rpc: 'github:actionsEnableWorkflow', fields: {} },
          get: { rpc: 'github:actionsGetWorkflow', fields: {} },
          getUsage: { rpc: 'github:actionsGetWorkflowUsage', fields: {} },
          list: { rpc: 'github:actionsListRepoWorkflows', fields: {} },
        },
      },
    },
  },
  googlecloudstorage: {
    defaultResource: 'bucket',
    resources: {
      bucket: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'google-cloud-storage:bucketCreate', fields: {} },
          delete: { rpc: 'google-cloud-storage:bucketDelete', fields: {} },
          get: { rpc: 'google-cloud-storage:bucketGet', fields: {} },
          getAll: { rpc: 'google-cloud-storage:bucketList', fields: {} },
          update: { rpc: 'google-cloud-storage:bucketUpdate', fields: {} },
        },
      },
      object: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'google-cloud-storage:objectUpload', fields: {} },
          delete: { rpc: 'google-cloud-storage:objectDelete', fields: {} },
          get: { rpc: 'google-cloud-storage:objectGet', fields: {} },
          getAll: { rpc: 'google-cloud-storage:objectList', fields: {} },
          update: {
            rpc: 'google-cloud-storage:objectUpdateMetadata',
            fields: {},
          },
        },
      },
    },
  },
  googledocs: {
    defaultResource: 'document',
    resources: {
      document: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'google-docs:docsDocumentsCreate', fields: {} },
          get: { rpc: 'google-docs:docsDocumentsGet', fields: {} },
          update: { rpc: 'google-docs:docsDocumentsBatchUpdate', fields: {} },
        },
      },
    },
  },
  jira: {
    defaultResource: 'issue',
    resources: {
      issue: {
        defaultOperation: 'create',
        operations: {
          changelog: { rpc: 'jira:getChangeLogs', fields: {} },
          create: { rpc: 'jira:createIssue', fields: {} },
          delete: { rpc: 'jira:deleteIssue', fields: {} },
          get: { rpc: 'jira:getIssue', fields: {} },
          getAll: { rpc: 'jira:searchForIssuesUsingJql', fields: {} },
          notify: { rpc: 'jira:notify', fields: {} },
          transitions: { rpc: 'jira:getTransitions', fields: {} },
          update: { rpc: 'jira:editIssue', fields: {} },
        },
      },
      issueAttachment: {
        defaultOperation: 'add',
        operations: {
          add: { rpc: 'jira:addAttachment', fields: {} },
          get: { rpc: 'jira:getAttachment', fields: {} },
          remove: { rpc: 'jira:removeAttachment', fields: {} },
        },
      },
      issueComment: {
        defaultOperation: 'add',
        operations: {
          add: { rpc: 'jira:addComment', fields: {} },
          get: { rpc: 'jira:getComment', fields: {} },
          getAll: { rpc: 'jira:getComments', fields: {} },
          remove: { rpc: 'jira:deleteComment', fields: {} },
          update: { rpc: 'jira:updateComment', fields: {} },
        },
      },
      user: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'jira:createUser', fields: {} },
          delete: { rpc: 'jira:removeUser', fields: {} },
          get: { rpc: 'jira:getUser', fields: {} },
        },
      },
    },
  },
  kafka: {
    defaultResource: 'message',
    resources: {
      message: {
        defaultOperation: 'send',
        operations: {
          send: { rpc: 'kafka:kafkaProduce', fields: {} },
        },
      },
    },
  },
  mailgun: {
    defaultResource: 'message',
    resources: {
      message: {
        defaultOperation: 'send',
        operations: {
          send: { rpc: 'mailgun:messagesSend', fields: {} },
        },
      },
    },
  },
  mandrill: {
    defaultResource: 'message',
    resources: {
      message: {
        defaultOperation: 'sendTemplate',
        operations: {
          sendTemplate: {
            rpc: 'mandrill:mandrillMessageSendTemplate',
            fields: {},
          },
          sendHtml: { rpc: 'mandrill:mandrillMessageSend', fields: {} },
        },
      },
    },
  },
  mattermost: {
    defaultResource: 'message',
    resources: {
      channel: {
        defaultOperation: 'create',
        operations: {
          addUser: { rpc: 'mattermost:createChannelsMembers', fields: {} },
          create: { rpc: 'mattermost:createChannels', fields: {} },
          delete: { rpc: 'mattermost:deleteChannel', fields: {} },
          members: { rpc: 'mattermost:listChannelsMembers', fields: {} },
          restore: { rpc: 'mattermost:createChannelsRestore', fields: {} },
          search: { rpc: 'mattermost:createTeamsChannelsSearch', fields: {} },
          statistics: { rpc: 'mattermost:listChannelsStats', fields: {} },
        },
      },
      message: {
        defaultOperation: 'post',
        operations: {
          delete: { rpc: 'mattermost:deletePost', fields: {} },
          post: { rpc: 'mattermost:createPosts', fields: {} },
          postEphemeral: { rpc: 'mattermost:createPostsEphemeral', fields: {} },
        },
      },
      reaction: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'mattermost:createReactions', fields: {} },
          delete: { rpc: 'mattermost:deleteUsersPostsReaction', fields: {} },
          getAll: { rpc: 'mattermost:listPostsReactions', fields: {} },
        },
      },
      user: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'mattermost:createUsers', fields: {} },
          deactive: { rpc: 'mattermost:deleteUser', fields: {} },
          getByEmail: { rpc: 'mattermost:getUsersEmail', fields: {} },
          getById: { rpc: 'mattermost:getUser', fields: {} },
          getAll: { rpc: 'mattermost:listUsers', fields: {} },
          invite: { rpc: 'mattermost:createTeamsInviteEmail', fields: {} },
        },
      },
    },
  },
  microsoftoutlook: {
    defaultResource: 'message',
    resources: {
      message: {
        defaultOperation: 'send',
        operations: {
          send: { rpc: 'microsoft-outlook:userSendMail', fields: {} },
          reply: { rpc: 'microsoft-outlook:userMessageReply', fields: {} },
          get: { rpc: 'microsoft-outlook:userGetMessage', fields: {} },
          getAll: { rpc: 'microsoft-outlook:userListMessage', fields: {} },
          delete: { rpc: 'microsoft-outlook:userDeleteMessage', fields: {} },
          move: { rpc: 'microsoft-outlook:userMessageMove', fields: {} },
          update: { rpc: 'microsoft-outlook:userUpdateMessage', fields: {} },
        },
      },
      draft: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'microsoft-outlook:userCreateMessage', fields: {} },
          get: { rpc: 'microsoft-outlook:userGetMessage', fields: {} },
          send: { rpc: 'microsoft-outlook:userMessageSend', fields: {} },
          update: { rpc: 'microsoft-outlook:userUpdateMessage', fields: {} },
          delete: { rpc: 'microsoft-outlook:userDeleteMessage', fields: {} },
        },
      },
      folder: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'microsoft-outlook:userCreateMailFolder', fields: {} },
          get: { rpc: 'microsoft-outlook:userGetMailFolder', fields: {} },
          getAll: { rpc: 'microsoft-outlook:userListMailFolder', fields: {} },
          delete: { rpc: 'microsoft-outlook:userDeleteMailFolder', fields: {} },
          update: { rpc: 'microsoft-outlook:userUpdateMailFolder', fields: {} },
        },
      },
      folderMessage: {
        defaultOperation: 'getAll',
        operations: {
          getAll: {
            rpc: 'microsoft-outlook:userMailFolderListMessage',
            fields: {},
          },
        },
      },
      event: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'microsoft-outlook:userCreateEvent', fields: {} },
          get: { rpc: 'microsoft-outlook:userGetEvent', fields: {} },
          getAll: { rpc: 'microsoft-outlook:userListEvent', fields: {} },
          delete: { rpc: 'microsoft-outlook:userDeleteEvent', fields: {} },
          update: { rpc: 'microsoft-outlook:userUpdateEvent', fields: {} },
        },
      },
      calendar: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'microsoft-outlook:userCreateCalendar', fields: {} },
          get: { rpc: 'microsoft-outlook:userGetCalendar', fields: {} },
          getAll: { rpc: 'microsoft-outlook:userListCalendar', fields: {} },
          delete: { rpc: 'microsoft-outlook:userDeleteCalendar', fields: {} },
          update: { rpc: 'microsoft-outlook:userUpdateCalendar', fields: {} },
        },
      },
      contact: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'microsoft-outlook:userCreateContact', fields: {} },
          get: { rpc: 'microsoft-outlook:userGetContact', fields: {} },
          getAll: { rpc: 'microsoft-outlook:userListContact', fields: {} },
          delete: { rpc: 'microsoft-outlook:userDeleteContact', fields: {} },
          update: { rpc: 'microsoft-outlook:userUpdateContact', fields: {} },
        },
      },
      messageAttachment: {
        defaultOperation: 'getAll',
        operations: {
          add: {
            rpc: 'microsoft-outlook:userMessageCreateAttachment',
            fields: {},
          },
          get: {
            rpc: 'microsoft-outlook:userMessageGetAttachment',
            fields: {},
          },
          getAll: {
            rpc: 'microsoft-outlook:userMessageListAttachment',
            fields: {},
          },
        },
      },
    },
  },
  nocodb: {
    defaultResource: 'row',
    resources: {
      row: {
        defaultOperation: 'getAll',
        operations: {
          create: { rpc: 'nocodb:dbDataTableRowCreate', fields: {} },
          get: { rpc: 'nocodb:dbDataTableRowRead', fields: {} },
          getAll: { rpc: 'nocodb:dbDataTableRowList', fields: {} },
          update: { rpc: 'nocodb:dbDataTableRowUpdate', fields: {} },
          delete: { rpc: 'nocodb:dbDataTableRowDelete', fields: {} },
        },
      },
    },
  },
  paddle: {
    defaultResource: 'payment',
    resources: {
      payment: {
        defaultOperation: 'getAll',
        operations: {
          getAll: { rpc: 'paddle:transactionsList', fields: {} },
        },
      },
      product: {
        defaultOperation: 'getAll',
        operations: {
          getAll: { rpc: 'paddle:productsList', fields: {} },
        },
      },
      user: {
        defaultOperation: 'getAll',
        operations: {
          getAll: { rpc: 'paddle:subscriptionsList', fields: {} },
        },
      },
    },
  },
  posthog: {
    defaultResource: 'event',
    resources: {
      event: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'posthog:eventsCapture', fields: {} },
        },
      },
    },
  },
  segment: {
    defaultResource: 'identify',
    resources: {
      identify: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'segment:identifyUser', fields: {} },
        },
      },
      track: {
        defaultOperation: 'event',
        operations: {
          event: { rpc: 'segment:trackEvent', fields: {} },
        },
      },
    },
  },
  sentryio: {
    defaultResource: 'event',
    resources: {
      event: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'sentry:sentryEventGet', fields: {} },
          getAll: { rpc: 'sentry:sentryEventGetMany', fields: {} },
        },
      },
      issue: {
        defaultOperation: 'delete',
        operations: {
          delete: { rpc: 'sentry:sentryIssueDelete', fields: {} },
          get: { rpc: 'sentry:sentryIssueGet', fields: {} },
          getAll: { rpc: 'sentry:sentryIssueGetMany', fields: {} },
          update: { rpc: 'sentry:sentryIssueUpdate', fields: {} },
        },
      },
      organization: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'sentry:sentryOrgCreate', fields: {} },
          get: { rpc: 'sentry:sentryOrgGet', fields: {} },
          getAll: { rpc: 'sentry:sentryOrgGetMany', fields: {} },
          update: { rpc: 'sentry:sentryOrgUpdate', fields: {} },
        },
      },
    },
  },
  spotify: {
    defaultResource: 'player',
    resources: {
      player: {
        defaultOperation: 'addSongToQueue',
        operations: {
          addSongToQueue: { rpc: 'spotify:addToQueue', fields: {} },
          currentlyPlaying: {
            rpc: 'spotify:getTheUsersCurrentlyPlayingTrack',
            fields: {},
          },
          nextSong: { rpc: 'spotify:skipUsersPlaybackToNextTrack', fields: {} },
          pause: { rpc: 'spotify:pauseAUsersPlayback', fields: {} },
          previousSong: {
            rpc: 'spotify:skipUsersPlaybackToPreviousTrack',
            fields: {},
          },
          recentlyPlayed: { rpc: 'spotify:getRecentlyPlayed', fields: {} },
          resume: { rpc: 'spotify:startAUsersPlayback', fields: {} },
          volume: { rpc: 'spotify:setVolumeForUsersPlayback', fields: {} },
          startMusic: { rpc: 'spotify:startAUsersPlayback', fields: {} },
        },
      },
      album: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'spotify:getAnAlbum', fields: {} },
          getNewReleases: { rpc: 'spotify:getNewReleases', fields: {} },
          getTracks: { rpc: 'spotify:getAnAlbumsTracks', fields: {} },
          search: { rpc: 'spotify:search', fields: {} },
        },
      },
      artist: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'spotify:getAnArtist', fields: {} },
          getAlbums: { rpc: 'spotify:getAnArtistsAlbums', fields: {} },
          getRelatedArtists: {
            rpc: 'spotify:getAnArtistsRelatedArtists',
            fields: {},
          },
          getTopTracks: { rpc: 'spotify:getAnArtistsTopTracks', fields: {} },
          search: { rpc: 'spotify:search', fields: {} },
        },
      },
      playlist: {
        defaultOperation: 'add',
        operations: {
          add: { rpc: 'spotify:addTracksToPlaylist', fields: {} },
          create: { rpc: 'spotify:createPlaylist', fields: {} },
          get: { rpc: 'spotify:getPlaylist', fields: {} },
          getUserPlaylists: {
            rpc: 'spotify:getAListOfCurrentUsersPlaylists',
            fields: {},
          },
          getTracks: { rpc: 'spotify:getPlaylistsTracks', fields: {} },
          delete: { rpc: 'spotify:removeTracksPlaylist', fields: {} },
          search: { rpc: 'spotify:search', fields: {} },
        },
      },
      track: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'spotify:getTrack', fields: {} },
          getAudioFeatures: { rpc: 'spotify:getAudioFeatures', fields: {} },
          search: { rpc: 'spotify:search', fields: {} },
        },
      },
      library: {
        defaultOperation: 'getLikedTracks',
        operations: {
          getLikedTracks: { rpc: 'spotify:getUsersSavedTracks', fields: {} },
        },
      },
      myData: {
        defaultOperation: 'getFollowingArtists',
        operations: {
          getFollowingArtists: { rpc: 'spotify:getFollowed', fields: {} },
        },
      },
    },
  },
  uptimerobot: {
    defaultResource: 'monitor',
    resources: {
      monitor: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'uptimerobot:monitorsCreate', fields: {} },
          delete: { rpc: 'uptimerobot:monitorsDelete', fields: {} },
          getAll: { rpc: 'uptimerobot:monitorsList', fields: {} },
        },
      },
    },
  },
  wordpress: {
    defaultResource: 'post',
    resources: {
      post: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'wordpress:createPost', fields: {} },
          get: { rpc: 'wordpress:getPost', fields: {} },
          getAll: { rpc: 'wordpress:listPosts', fields: {} },
          update: { rpc: 'wordpress:updatePost', fields: {} },
          delete: { rpc: 'wordpress:deletePost', fields: {} },
        },
      },
      page: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'wordpress:createPage', fields: {} },
          get: { rpc: 'wordpress:getPage', fields: {} },
          getAll: { rpc: 'wordpress:listPages', fields: {} },
          update: { rpc: 'wordpress:updatePage', fields: {} },
          delete: { rpc: 'wordpress:deletePage', fields: {} },
        },
      },
      user: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'wordpress:createUser', fields: {} },
          get: { rpc: 'wordpress:getUser', fields: {} },
          getAll: { rpc: 'wordpress:listUsers', fields: {} },
          update: { rpc: 'wordpress:updateUser', fields: {} },
          delete: { rpc: 'wordpress:deleteUser', fields: {} },
        },
      },
    },
  },
  youtube: {
    defaultResource: 'channel',
    resources: {
      channel: {
        defaultOperation: 'getAll',
        operations: {
          get: { rpc: 'youtube:youtubeChannelsList', fields: {} },
          getAll: { rpc: 'youtube:youtubeChannelsList', fields: {} },
          update: { rpc: 'youtube:youtubeChannelsUpdate', fields: {} },
          uploadBanner: {
            rpc: 'youtube:youtubeChannelBannersInsert',
            fields: {},
          },
        },
      },
      playlist: {
        defaultOperation: 'getAll',
        operations: {
          create: { rpc: 'youtube:youtubePlaylistsInsert', fields: {} },
          delete: { rpc: 'youtube:youtubePlaylistsDelete', fields: {} },
          get: { rpc: 'youtube:youtubePlaylistsList', fields: {} },
          getAll: { rpc: 'youtube:youtubePlaylistsList', fields: {} },
          update: { rpc: 'youtube:youtubePlaylistsUpdate', fields: {} },
        },
      },
      playlistItem: {
        defaultOperation: 'add',
        operations: {
          add: { rpc: 'youtube:youtubePlaylistItemsInsert', fields: {} },
          delete: { rpc: 'youtube:youtubePlaylistItemsDelete', fields: {} },
          get: { rpc: 'youtube:youtubePlaylistItemsList', fields: {} },
          getAll: { rpc: 'youtube:youtubePlaylistItemsList', fields: {} },
        },
      },
      video: {
        defaultOperation: 'getAll',
        operations: {
          delete: { rpc: 'youtube:youtubeVideosDelete', fields: {} },
          get: { rpc: 'youtube:youtubeVideosList', fields: {} },
          getAll: { rpc: 'youtube:youtubeVideosList', fields: {} },
          rate: { rpc: 'youtube:youtubeVideosRate', fields: {} },
          update: { rpc: 'youtube:youtubeVideosUpdate', fields: {} },
          upload: { rpc: 'youtube:youtubeVideosInsert', fields: {} },
        },
      },
      videoCategory: {
        defaultOperation: 'getAll',
        operations: {
          getAll: { rpc: 'youtube:youtubeVideoCategoriesList', fields: {} },
        },
      },
    },
  },
  zendesk: {
    defaultResource: 'ticket',
    resources: {
      ticket: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'zendesk:createTicket', fields: {} },
          delete: { rpc: 'zendesk:deleteTicket', fields: {} },
          get: { rpc: 'zendesk:showTicket', fields: {} },
          getAll: { rpc: 'zendesk:listTickets', fields: {} },
          recover: { rpc: 'zendesk:recoverSuspendedTicket', fields: {} },
          update: { rpc: 'zendesk:updateTicket', fields: {} },
        },
      },
      ticketField: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'zendesk:showTicketfield', fields: {} },
          getAll: { rpc: 'zendesk:listTicketFields', fields: {} },
        },
      },
      user: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'zendesk:createUser', fields: {} },
          delete: { rpc: 'zendesk:deleteUser', fields: {} },
          get: { rpc: 'zendesk:showUser', fields: {} },
          getAll: { rpc: 'zendesk:listUsers', fields: {} },
          getOrganizations: {
            rpc: 'zendesk:listUserOrganizations',
            fields: {},
          },
          getRelatedData: { rpc: 'zendesk:showUserRelated', fields: {} },
          search: { rpc: 'zendesk:searchUsers', fields: {} },
          update: { rpc: 'zendesk:updateUser', fields: {} },
        },
      },
      organization: {
        defaultOperation: 'create',
        operations: {
          count: { rpc: 'zendesk:countOrganizations', fields: {} },
          create: { rpc: 'zendesk:createOrganization', fields: {} },
          delete: { rpc: 'zendesk:deleteOrganization', fields: {} },
          get: { rpc: 'zendesk:showOrganization', fields: {} },
          getAll: { rpc: 'zendesk:listOrganizations', fields: {} },
          getRelatedData: { rpc: 'zendesk:organizationRelated', fields: {} },
          update: { rpc: 'zendesk:updateOrganization', fields: {} },
        },
      },
    },
  },
  airtop: {
    defaultResource: 'session',
    resources: {
      agent: {
        defaultOperation: 'run',
        operations: {
          run: { rpc: 'airtop:agentRun', fields: {} },
        },
      },
      session: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'airtop:sessionCreate', fields: {} },
          save: { rpc: 'airtop:sessionSave', fields: {} },
          terminate: { rpc: 'airtop:sessionTerminate', fields: {} },
        },
      },
      window: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'airtop:windowCreate', fields: {} },
          close: { rpc: 'airtop:windowClose', fields: {} },
          takeScreenshot: { rpc: 'airtop:windowTakeScreenshot', fields: {} },
          load: { rpc: 'airtop:windowLoad', fields: {} },
        },
      },
      extraction: {
        defaultOperation: 'getPaginated',
        operations: {
          getPaginated: { rpc: 'airtop:extractionGetPaginated', fields: {} },
          query: { rpc: 'airtop:extractionQuery', fields: {} },
          scrape: { rpc: 'airtop:extractionScrape', fields: {} },
        },
      },
      interaction: {
        defaultOperation: 'click',
        operations: {
          click: { rpc: 'airtop:interactionClick', fields: {} },
          fill: { rpc: 'airtop:interactionFill', fields: {} },
          hover: { rpc: 'airtop:interactionHover', fields: {} },
          type: { rpc: 'airtop:interactionType', fields: {} },
        },
      },
      file: {
        defaultOperation: 'getMany',
        operations: {
          getMany: { rpc: 'airtop:fileGetMany', fields: {} },
          get: { rpc: 'airtop:fileGet', fields: {} },
          deleteFile: { rpc: 'airtop:fileDelete', fields: {} },
          upload: { rpc: 'airtop:fileUpload', fields: {} },
          load: { rpc: 'airtop:fileLoad', fields: {} },
        },
      },
    },
  },
  clockify: {
    defaultResource: 'project',
    resources: {
      client: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'clockify:clientCreate', fields: {} },
          delete: { rpc: 'clockify:clientDelete', fields: {} },
          get: { rpc: 'clockify:clientGet', fields: {} },
          getAll: { rpc: 'clockify:clientGetAll', fields: {} },
          update: { rpc: 'clockify:clientUpdate', fields: {} },
        },
      },
      project: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'clockify:projectCreate', fields: {} },
          delete: { rpc: 'clockify:projectDelete', fields: {} },
          get: { rpc: 'clockify:projectGet', fields: {} },
          getAll: { rpc: 'clockify:projectGetAll', fields: {} },
          update: { rpc: 'clockify:projectUpdate', fields: {} },
        },
      },
      tag: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'clockify:tagCreate', fields: {} },
          delete: { rpc: 'clockify:tagDelete', fields: {} },
          getAll: { rpc: 'clockify:tagGetAll', fields: {} },
          update: { rpc: 'clockify:tagUpdate', fields: {} },
        },
      },
      task: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'clockify:taskCreate', fields: {} },
          delete: { rpc: 'clockify:taskDelete', fields: {} },
          get: { rpc: 'clockify:taskGet', fields: {} },
          getAll: { rpc: 'clockify:taskGetAll', fields: {} },
          update: { rpc: 'clockify:taskUpdate', fields: {} },
        },
      },
      timeEntry: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'clockify:timeEntryCreate', fields: {} },
          delete: { rpc: 'clockify:timeEntryDelete', fields: {} },
          get: { rpc: 'clockify:timeEntryGet', fields: {} },
          update: { rpc: 'clockify:timeEntryUpdate', fields: {} },
        },
      },
      user: {
        defaultOperation: 'getAll',
        operations: {
          getAll: { rpc: 'clockify:userGetAll', fields: {} },
        },
      },
      workspace: {
        defaultOperation: 'getAll',
        operations: {
          getAll: { rpc: 'clockify:workspaceGetAll', fields: {} },
        },
      },
    },
  },
  openweathermap: {
    defaultResource: 'weather',
    resources: {
      weather: {
        defaultOperation: 'currentWeather',
        operations: {
          currentWeather: {
            rpc: 'open-weather-map:currentWeather',
            fields: {},
          },
          '5DayForecast': {
            rpc: 'open-weather-map:fiveDayForecast',
            fields: {},
          },
        },
      },
    },
  },
  bamboohr: {
    defaultResource: 'employee',
    resources: {
      employee: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'bamboo-hr:employeeCreate', fields: {} },
          get: { rpc: 'bamboo-hr:employeeGet', fields: {} },
          getAll: { rpc: 'bamboo-hr:employeeGetAll', fields: {} },
          update: { rpc: 'bamboo-hr:employeeUpdate', fields: {} },
        },
      },
      employeeDocument: {
        defaultOperation: 'delete',
        operations: {
          delete: { rpc: 'bamboo-hr:employeeDocumentDelete', fields: {} },
          download: { rpc: 'bamboo-hr:employeeDocumentDownload', fields: {} },
          getAll: { rpc: 'bamboo-hr:employeeDocumentGetAll', fields: {} },
          update: { rpc: 'bamboo-hr:employeeDocumentUpdate', fields: {} },
          upload: { rpc: 'bamboo-hr:employeeDocumentUpload', fields: {} },
        },
      },
      file: {
        defaultOperation: 'delete',
        operations: {
          delete: { rpc: 'bamboo-hr:fileDelete', fields: {} },
          download: { rpc: 'bamboo-hr:fileDownload', fields: {} },
          getAll: { rpc: 'bamboo-hr:fileGetAll', fields: {} },
          update: { rpc: 'bamboo-hr:fileUpdate', fields: {} },
          upload: { rpc: 'bamboo-hr:fileUpload', fields: {} },
        },
      },
      companyReport: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'bamboo-hr:companyReportGet', fields: {} },
        },
      },
    },
  },
  baserow: {
    defaultResource: 'row',
    resources: {
      row: {
        defaultOperation: 'getAll',
        operations: {
          create: { rpc: 'baserow:rowCreate', fields: {} },
          get: { rpc: 'baserow:rowGet', fields: {} },
          getAll: { rpc: 'baserow:rowGetAll', fields: {} },
          update: { rpc: 'baserow:rowUpdate', fields: {} },
          delete: { rpc: 'baserow:rowDelete', fields: {} },
          batchCreate: { rpc: 'baserow:rowBatchCreate', fields: {} },
          batchUpdate: { rpc: 'baserow:rowBatchUpdate', fields: {} },
          batchDelete: { rpc: 'baserow:rowBatchDelete', fields: {} },
        },
      },
    },
  },
  clearbit: {
    defaultResource: 'company',
    resources: {
      company: {
        defaultOperation: 'enrich',
        operations: {
          enrich: { rpc: 'clearbit:companyEnrich', fields: {} },
          autocomplete: { rpc: 'clearbit:companyAutocomplete', fields: {} },
        },
      },
      person: {
        defaultOperation: 'enrich',
        operations: {
          enrich: { rpc: 'clearbit:personEnrich', fields: {} },
        },
      },
    },
  },
  facebookgraphapi: {
    defaultResource: 'graph',
    resources: {
      graph: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'facebook-graph-api:graphGet', fields: {} },
          post: { rpc: 'facebook-graph-api:graphPost', fields: {} },
          delete: { rpc: 'facebook-graph-api:graphDelete', fields: {} },
        },
      },
    },
  },
  linear: {
    defaultResource: 'issue',
    resources: {
      issue: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'linear:issueCreate', fields: {} },
          delete: { rpc: 'linear:issueDelete', fields: {} },
          get: { rpc: 'linear:issueGet', fields: {} },
          getAll: { rpc: 'linear:issueGetAll', fields: {} },
          update: { rpc: 'linear:issueUpdate', fields: {} },
          addLink: { rpc: 'linear:issueAddLink', fields: {} },
        },
      },
      comment: {
        defaultOperation: 'addComment',
        operations: {
          addComment: { rpc: 'linear:commentAddComment', fields: {} },
        },
      },
    },
  },
  linkedin: {
    defaultResource: 'post',
    resources: {
      post: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'linkedin:postCreate', fields: {} },
        },
      },
    },
  },
  mautic: {
    defaultResource: 'contact',
    resources: {
      contact: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'mautic:contactCreate', fields: {} },
          update: { rpc: 'mautic:contactUpdate', fields: {} },
          get: { rpc: 'mautic:contactGet', fields: {} },
          getAll: { rpc: 'mautic:contactGetAll', fields: {} },
          delete: { rpc: 'mautic:contactDelete', fields: {} },
          sendEmail: { rpc: 'mautic:contactSendEmail', fields: {} },
          editDoNotContactList: {
            rpc: 'mautic:contactEditDoNotContactList',
            fields: {},
          },
          editContactPoint: {
            rpc: 'mautic:contactEditContactPoint',
            fields: {},
          },
        },
      },
      company: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'mautic:companyCreate', fields: {} },
          update: { rpc: 'mautic:companyUpdate', fields: {} },
          get: { rpc: 'mautic:companyGet', fields: {} },
          getAll: { rpc: 'mautic:companyGetAll', fields: {} },
          delete: { rpc: 'mautic:companyDelete', fields: {} },
        },
      },
      companyContact: {
        defaultOperation: 'add',
        operations: {
          add: { rpc: 'mautic:companyContactAdd', fields: {} },
          remove: { rpc: 'mautic:companyContactRemove', fields: {} },
        },
      },
      contactSegment: {
        defaultOperation: 'add',
        operations: {
          add: { rpc: 'mautic:contactSegmentAdd', fields: {} },
          remove: { rpc: 'mautic:contactSegmentRemove', fields: {} },
        },
      },
      campaignContact: {
        defaultOperation: 'add',
        operations: {
          add: { rpc: 'mautic:campaignContactAdd', fields: {} },
          remove: { rpc: 'mautic:campaignContactRemove', fields: {} },
        },
      },
      segmentEmail: {
        defaultOperation: 'send',
        operations: {
          send: { rpc: 'mautic:segmentEmailSend', fields: {} },
        },
      },
    },
  },
  mondaycom: {
    defaultResource: 'board',
    resources: {
      board: {
        defaultOperation: 'create',
        operations: {
          archive: { rpc: 'monday-com:boardArchive', fields: {} },
          create: { rpc: 'monday-com:boardCreate', fields: {} },
          get: { rpc: 'monday-com:boardGet', fields: {} },
          getAll: { rpc: 'monday-com:boardGetAll', fields: {} },
        },
      },
      boardColumn: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'monday-com:boardColumnCreate', fields: {} },
          getAll: { rpc: 'monday-com:boardColumnGetAll', fields: {} },
        },
      },
      boardGroup: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'monday-com:boardGroupCreate', fields: {} },
          delete: { rpc: 'monday-com:boardGroupDelete', fields: {} },
          getAll: { rpc: 'monday-com:boardGroupGetAll', fields: {} },
        },
      },
      boardItem: {
        defaultOperation: 'create',
        operations: {
          addUpdate: { rpc: 'monday-com:boardItemAddUpdate', fields: {} },
          changeColumnValue: {
            rpc: 'monday-com:boardItemChangeColumnValue',
            fields: {},
          },
          changeMultipleColumnValues: {
            rpc: 'monday-com:boardItemChangeMultipleColumnValues',
            fields: {},
          },
          create: { rpc: 'monday-com:boardItemCreate', fields: {} },
          delete: { rpc: 'monday-com:boardItemDelete', fields: {} },
          get: { rpc: 'monday-com:boardItemGet', fields: {} },
          getByColumnValue: {
            rpc: 'monday-com:boardItemGetByColumnValue',
            fields: {},
          },
          getAll: { rpc: 'monday-com:boardItemGetAll', fields: {} },
          move: { rpc: 'monday-com:boardItemMove', fields: {} },
        },
      },
    },
  },
  salesforce: {
    defaultResource: 'lead',
    resources: {
      account: {
        defaultOperation: 'create',
        operations: {
          addNote: { rpc: 'salesforce:accountAddNote', fields: {} },
          create: { rpc: 'salesforce:accountCreate', fields: {} },
          upsert: { rpc: 'salesforce:accountUpsert', fields: {} },
          delete: { rpc: 'salesforce:accountDelete', fields: {} },
          get: { rpc: 'salesforce:accountGet', fields: {} },
          getAll: { rpc: 'salesforce:accountGetAll', fields: {} },
          getSummary: { rpc: 'salesforce:accountGetSummary', fields: {} },
          update: { rpc: 'salesforce:accountUpdate', fields: {} },
        },
      },
      contact: {
        defaultOperation: 'create',
        operations: {
          addToCampaign: { rpc: 'salesforce:contactAddToCampaign', fields: {} },
          addNote: { rpc: 'salesforce:contactAddNote', fields: {} },
          create: { rpc: 'salesforce:contactCreate', fields: {} },
          upsert: { rpc: 'salesforce:contactUpsert', fields: {} },
          delete: { rpc: 'salesforce:contactDelete', fields: {} },
          get: { rpc: 'salesforce:contactGet', fields: {} },
          getAll: { rpc: 'salesforce:contactGetAll', fields: {} },
          getSummary: { rpc: 'salesforce:contactGetSummary', fields: {} },
          update: { rpc: 'salesforce:contactUpdate', fields: {} },
        },
      },
      lead: {
        defaultOperation: 'create',
        operations: {
          addToCampaign: { rpc: 'salesforce:leadAddToCampaign', fields: {} },
          addNote: { rpc: 'salesforce:leadAddNote', fields: {} },
          create: { rpc: 'salesforce:leadCreate', fields: {} },
          upsert: { rpc: 'salesforce:leadUpsert', fields: {} },
          delete: { rpc: 'salesforce:leadDelete', fields: {} },
          get: { rpc: 'salesforce:leadGet', fields: {} },
          getAll: { rpc: 'salesforce:leadGetAll', fields: {} },
          getSummary: { rpc: 'salesforce:leadGetSummary', fields: {} },
          update: { rpc: 'salesforce:leadUpdate', fields: {} },
        },
      },
      opportunity: {
        defaultOperation: 'create',
        operations: {
          addNote: { rpc: 'salesforce:opportunityAddNote', fields: {} },
          create: { rpc: 'salesforce:opportunityCreate', fields: {} },
          upsert: { rpc: 'salesforce:opportunityUpsert', fields: {} },
          delete: { rpc: 'salesforce:opportunityDelete', fields: {} },
          get: { rpc: 'salesforce:opportunityGet', fields: {} },
          getAll: { rpc: 'salesforce:opportunityGetAll', fields: {} },
          getSummary: { rpc: 'salesforce:opportunityGetSummary', fields: {} },
          update: { rpc: 'salesforce:opportunityUpdate', fields: {} },
        },
      },
      case: {
        defaultOperation: 'create',
        operations: {
          addComment: { rpc: 'salesforce:caseAddComment', fields: {} },
          create: { rpc: 'salesforce:caseCreate', fields: {} },
          delete: { rpc: 'salesforce:caseDelete', fields: {} },
          get: { rpc: 'salesforce:caseGet', fields: {} },
          getAll: { rpc: 'salesforce:caseGetAll', fields: {} },
          getSummary: { rpc: 'salesforce:caseGetSummary', fields: {} },
          update: { rpc: 'salesforce:caseUpdate', fields: {} },
        },
      },
      task: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'salesforce:taskCreate', fields: {} },
          delete: { rpc: 'salesforce:taskDelete', fields: {} },
          get: { rpc: 'salesforce:taskGet', fields: {} },
          getAll: { rpc: 'salesforce:taskGetAll', fields: {} },
          getSummary: { rpc: 'salesforce:taskGetSummary', fields: {} },
          update: { rpc: 'salesforce:taskUpdate', fields: {} },
        },
      },
      user: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'salesforce:userGet', fields: {} },
          getAll: { rpc: 'salesforce:userGetAll', fields: {} },
        },
      },
      customObject: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'salesforce:customObjectCreate', fields: {} },
          upsert: { rpc: 'salesforce:customObjectUpsert', fields: {} },
          delete: { rpc: 'salesforce:customObjectDelete', fields: {} },
          get: { rpc: 'salesforce:customObjectGet', fields: {} },
          getAll: { rpc: 'salesforce:customObjectGetAll', fields: {} },
          update: { rpc: 'salesforce:customObjectUpdate', fields: {} },
        },
      },
      document: {
        defaultOperation: 'upload',
        operations: {
          upload: { rpc: 'salesforce:documentUpload', fields: {} },
        },
      },
      flow: {
        defaultOperation: 'invoke',
        operations: {
          getAll: { rpc: 'salesforce:flowGetAll', fields: {} },
          invoke: { rpc: 'salesforce:flowInvoke', fields: {} },
        },
      },
      attachment: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'salesforce:attachmentCreate', fields: {} },
          delete: { rpc: 'salesforce:attachmentDelete', fields: {} },
          get: { rpc: 'salesforce:attachmentGet', fields: {} },
          getAll: { rpc: 'salesforce:attachmentGetAll', fields: {} },
          getSummary: { rpc: 'salesforce:attachmentGetSummary', fields: {} },
          update: { rpc: 'salesforce:attachmentUpdate', fields: {} },
        },
      },
      search: {
        defaultOperation: 'query',
        operations: {
          query: { rpc: 'salesforce:searchQuery', fields: {} },
        },
      },
    },
  },
  snowflake: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'insert',
        operations: {
          executeQuery: { rpc: 'snowflake:executeQuery', fields: {} },
          insert: { rpc: 'snowflake:insert', fields: {} },
          update: { rpc: 'snowflake:update', fields: {} },
        },
      },
    },
  },
  thehive: {
    defaultResource: 'alert',
    resources: {
      alert: {
        defaultOperation: 'create',
        operations: {
          count: { rpc: 'the-hive:alertCount', fields: {} },
          create: { rpc: 'the-hive:alertCreate', fields: {} },
          executeResponder: {
            rpc: 'the-hive:alertExecuteResponder',
            fields: {},
          },
          get: { rpc: 'the-hive:alertGet', fields: {} },
          getAll: { rpc: 'the-hive:alertGetAll', fields: {} },
          markAsRead: { rpc: 'the-hive:alertMarkAsRead', fields: {} },
          markAsUnread: { rpc: 'the-hive:alertMarkAsUnread', fields: {} },
          merge: { rpc: 'the-hive:alertMerge', fields: {} },
          promote: { rpc: 'the-hive:alertPromote', fields: {} },
          update: { rpc: 'the-hive:alertUpdate', fields: {} },
        },
      },
      case: {
        defaultOperation: 'getAll',
        operations: {
          count: { rpc: 'the-hive:caseCount', fields: {} },
          create: { rpc: 'the-hive:caseCreate', fields: {} },
          executeResponder: {
            rpc: 'the-hive:caseExecuteResponder',
            fields: {},
          },
          getAll: { rpc: 'the-hive:caseGetAll', fields: {} },
          get: { rpc: 'the-hive:caseGet', fields: {} },
          update: { rpc: 'the-hive:caseUpdate', fields: {} },
        },
      },
      observable: {
        defaultOperation: 'getAll',
        operations: {
          count: { rpc: 'the-hive:observableCount', fields: {} },
          create: { rpc: 'the-hive:observableCreate', fields: {} },
          executeAnalyzer: {
            rpc: 'the-hive:observableExecuteAnalyzer',
            fields: {},
          },
          executeResponder: {
            rpc: 'the-hive:observableExecuteResponder',
            fields: {},
          },
          getAll: { rpc: 'the-hive:observableGetAll', fields: {} },
          get: { rpc: 'the-hive:observableGet', fields: {} },
          search: { rpc: 'the-hive:observableSearch', fields: {} },
          update: { rpc: 'the-hive:observableUpdate', fields: {} },
        },
      },
      task: {
        defaultOperation: 'getAll',
        operations: {
          count: { rpc: 'the-hive:taskCount', fields: {} },
          create: { rpc: 'the-hive:taskCreate', fields: {} },
          executeResponder: {
            rpc: 'the-hive:taskExecuteResponder',
            fields: {},
          },
          getAll: { rpc: 'the-hive:taskGetAll', fields: {} },
          get: { rpc: 'the-hive:taskGet', fields: {} },
          search: { rpc: 'the-hive:taskSearch', fields: {} },
          update: { rpc: 'the-hive:taskUpdate', fields: {} },
        },
      },
      log: {
        defaultOperation: 'getAll',
        operations: {
          create: { rpc: 'the-hive:logCreate', fields: {} },
          executeResponder: { rpc: 'the-hive:logExecuteResponder', fields: {} },
          getAll: { rpc: 'the-hive:logGetAll', fields: {} },
          get: { rpc: 'the-hive:logGet', fields: {} },
        },
      },
    },
  },
  twitter: {
    defaultResource: 'tweet',
    resources: {
      tweet: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'twitter:tweetCreate', fields: {} },
          delete: { rpc: 'twitter:tweetDelete', fields: {} },
          like: { rpc: 'twitter:tweetLike', fields: {} },
          retweet: { rpc: 'twitter:tweetRetweet', fields: {} },
          search: { rpc: 'twitter:tweetSearch', fields: {} },
        },
      },
      directMessage: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'twitter:directMessageCreate', fields: {} },
        },
      },
      list: {
        defaultOperation: 'add',
        operations: {
          add: { rpc: 'twitter:listAdd', fields: {} },
        },
      },
      user: {
        defaultOperation: 'searchUser',
        operations: {
          searchUser: { rpc: 'twitter:userSearch', fields: {} },
        },
      },
    },
  },
  asana: {
    defaultResource: 'task',
    resources: {
      task: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'asana:taskCreate', fields: {} },
          delete: { rpc: 'asana:taskDelete', fields: {} },
          get: { rpc: 'asana:taskGet', fields: {} },
          getAll: { rpc: 'asana:taskGetAll', fields: {} },
          move: { rpc: 'asana:taskMove', fields: {} },
          search: { rpc: 'asana:taskSearch', fields: {} },
          update: { rpc: 'asana:taskUpdate', fields: {} },
        },
      },
      subtask: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'asana:subtaskCreate', fields: {} },
          getAll: { rpc: 'asana:subtaskGetAll', fields: {} },
        },
      },
      taskComment: {
        defaultOperation: 'add',
        operations: {
          add: { rpc: 'asana:taskCommentAdd', fields: {} },
          remove: { rpc: 'asana:taskCommentRemove', fields: {} },
        },
      },
      taskProject: {
        defaultOperation: 'add',
        operations: {
          add: { rpc: 'asana:taskProjectAdd', fields: {} },
          remove: { rpc: 'asana:taskProjectRemove', fields: {} },
        },
      },
      taskTag: {
        defaultOperation: 'add',
        operations: {
          add: { rpc: 'asana:taskTagAdd', fields: {} },
          remove: { rpc: 'asana:taskTagRemove', fields: {} },
        },
      },
      user: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'asana:userGet', fields: {} },
          getAll: { rpc: 'asana:userGetAll', fields: {} },
        },
      },
      project: {
        defaultOperation: 'get',
        operations: {
          create: { rpc: 'asana:projectCreate', fields: {} },
          delete: { rpc: 'asana:projectDelete', fields: {} },
          get: { rpc: 'asana:projectGet', fields: {} },
          getAll: { rpc: 'asana:projectGetAll', fields: {} },
          update: { rpc: 'asana:projectUpdate', fields: {} },
        },
      },
    },
  },
  awss3: {
    defaultResource: 'file',
    resources: {
      bucket: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'aws-s3:bucketCreate', fields: {} },
          delete: { rpc: 'aws-s3:bucketDelete', fields: {} },
          getAll: { rpc: 'aws-s3:bucketGetAll', fields: {} },
          search: { rpc: 'aws-s3:bucketSearch', fields: {} },
        },
      },
      file: {
        defaultOperation: 'download',
        operations: {
          copy: { rpc: 'aws-s3:fileCopy', fields: {} },
          delete: { rpc: 'aws-s3:fileDelete', fields: {} },
          download: { rpc: 'aws-s3:fileDownload', fields: {} },
          getAll: { rpc: 'aws-s3:fileGetAll', fields: {} },
          upload: { rpc: 'aws-s3:fileUpload', fields: {} },
        },
      },
      folder: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'aws-s3:folderCreate', fields: {} },
          delete: { rpc: 'aws-s3:folderDelete', fields: {} },
          getAll: { rpc: 'aws-s3:folderGetAll', fields: {} },
        },
      },
    },
  },
  gitlab: {
    defaultResource: 'issue',
    resources: {
      issue: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'gitlab:issueCreate', fields: {} },
          createComment: { rpc: 'gitlab:issueCreateComment', fields: {} },
          edit: { rpc: 'gitlab:issueEdit', fields: {} },
          get: { rpc: 'gitlab:issueGet', fields: {} },
          lock: { rpc: 'gitlab:issueLock', fields: {} },
        },
      },
      repository: {
        defaultOperation: 'getIssues',
        operations: {
          get: { rpc: 'gitlab:repositoryGet', fields: {} },
          getIssues: { rpc: 'gitlab:repositoryGetIssues', fields: {} },
        },
      },
      user: {
        defaultOperation: 'getRepositories',
        operations: {
          getRepositories: { rpc: 'gitlab:userGetRepositories', fields: {} },
        },
      },
      release: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'gitlab:releaseCreate', fields: {} },
          delete: { rpc: 'gitlab:releaseDelete', fields: {} },
          get: { rpc: 'gitlab:releaseGet', fields: {} },
          getAll: { rpc: 'gitlab:releaseGetAll', fields: {} },
          update: { rpc: 'gitlab:releaseUpdate', fields: {} },
        },
      },
      file: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'gitlab:fileCreate', fields: {} },
          delete: { rpc: 'gitlab:fileDelete', fields: {} },
          edit: { rpc: 'gitlab:fileEdit', fields: {} },
          get: { rpc: 'gitlab:fileGet', fields: {} },
          list: { rpc: 'gitlab:fileList', fields: {} },
        },
      },
    },
  },
  googlecloudnaturallanguage: {
    defaultResource: 'document',
    resources: {
      document: {
        defaultOperation: 'analyzeSentiment',
        operations: {
          analyzeSentiment: {
            rpc: 'google-cloud-natural-language:analyzeSentiment',
            fields: {},
          },
        },
      },
    },
  },
  humanticai: {
    defaultResource: 'profile',
    resources: {
      profile: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'humantic-ai:profileCreate', fields: {} },
          get: { rpc: 'humantic-ai:profileGet', fields: {} },
          update: { rpc: 'humantic-ai:profileUpdate', fields: {} },
        },
      },
    },
  },
  hunter: {
    defaultResource: 'hunter',
    resources: {
      hunter: {
        defaultOperation: 'domainSearch',
        operations: {
          domainSearch: { rpc: 'hunter:domainSearch', fields: {} },
          emailFinder: { rpc: 'hunter:emailFinder', fields: {} },
          emailVerifier: { rpc: 'hunter:emailVerifier', fields: {} },
        },
      },
    },
  },
  lemlist: {
    defaultResource: 'activity',
    resources: {
      activity: {
        defaultOperation: 'getAll',
        operations: {
          getAll: { rpc: 'lemlist:activityGetAll', fields: {} },
        },
      },
      campaign: {
        defaultOperation: 'getAll',
        operations: {
          getAll: { rpc: 'lemlist:campaignGetAll', fields: {} },
          getStats: { rpc: 'lemlist:campaignGetStats', fields: {} },
        },
      },
      enrich: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'lemlist:enrichGet', fields: {} },
          enrichLead: { rpc: 'lemlist:enrichLead', fields: {} },
          enrichPerson: { rpc: 'lemlist:enrichPerson', fields: {} },
        },
      },
      lead: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'lemlist:leadCreate', fields: {} },
          delete: { rpc: 'lemlist:leadDelete', fields: {} },
          get: { rpc: 'lemlist:leadGet', fields: {} },
          unsubscribe: { rpc: 'lemlist:leadDelete', fields: {} },
        },
      },
      team: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'lemlist:teamGet', fields: {} },
          getCredits: { rpc: 'lemlist:teamGetCredits', fields: {} },
        },
      },
      unsubscribe: {
        defaultOperation: 'add',
        operations: {
          add: { rpc: 'lemlist:unsubscribeAdd', fields: {} },
          delete: { rpc: 'lemlist:unsubscribeDelete', fields: {} },
          getAll: { rpc: 'lemlist:unsubscribeGetAll', fields: {} },
        },
      },
    },
  },
  nextcloud: {
    defaultResource: 'file',
    resources: {
      file: {
        defaultOperation: 'upload',
        operations: {
          copy: { rpc: 'nextcloud:fileCopy', fields: {} },
          delete: { rpc: 'nextcloud:fileDelete', fields: {} },
          download: { rpc: 'nextcloud:fileDownload', fields: {} },
          move: { rpc: 'nextcloud:fileMove', fields: {} },
          share: { rpc: 'nextcloud:fileShare', fields: {} },
          upload: { rpc: 'nextcloud:fileUpload', fields: {} },
        },
      },
      folder: {
        defaultOperation: 'create',
        operations: {
          copy: { rpc: 'nextcloud:folderCopy', fields: {} },
          create: { rpc: 'nextcloud:folderCreate', fields: {} },
          delete: { rpc: 'nextcloud:folderDelete', fields: {} },
          list: { rpc: 'nextcloud:folderList', fields: {} },
          move: { rpc: 'nextcloud:folderMove', fields: {} },
          share: { rpc: 'nextcloud:folderShare', fields: {} },
        },
      },
      user: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'nextcloud:userCreate', fields: {} },
          delete: { rpc: 'nextcloud:userDelete', fields: {} },
          get: { rpc: 'nextcloud:userGet', fields: {} },
          getAll: { rpc: 'nextcloud:userGetAll', fields: {} },
          update: { rpc: 'nextcloud:userUpdate', fields: {} },
        },
      },
    },
  },
  odoo: {
    defaultResource: 'contact',
    resources: {
      activity: {
        defaultOperation: 'getAll',
        operations: {
          create: { rpc: 'odoo:activityCreate', fields: {} },
          get: { rpc: 'odoo:activityGet', fields: {} },
          getAll: { rpc: 'odoo:activityGetAll', fields: {} },
          update: { rpc: 'odoo:activityUpdate', fields: {} },
          delete: { rpc: 'odoo:activityDelete', fields: {} },
        },
      },
      contact: {
        defaultOperation: 'getAll',
        operations: {
          create: { rpc: 'odoo:contactCreate', fields: {} },
          get: { rpc: 'odoo:contactGet', fields: {} },
          getAll: { rpc: 'odoo:contactGetAll', fields: {} },
          update: { rpc: 'odoo:contactUpdate', fields: {} },
          delete: { rpc: 'odoo:contactDelete', fields: {} },
        },
      },
      custom: {
        defaultOperation: 'getAll',
        operations: {
          create: { rpc: 'odoo:customCreate', fields: {} },
          get: { rpc: 'odoo:customGet', fields: {} },
          getAll: { rpc: 'odoo:customGetAll', fields: {} },
          update: { rpc: 'odoo:customUpdate', fields: {} },
          delete: { rpc: 'odoo:customDelete', fields: {} },
        },
      },
      note: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'odoo:noteCreate', fields: {} },
          get: { rpc: 'odoo:noteGet', fields: {} },
          getAll: { rpc: 'odoo:noteGetAll', fields: {} },
          update: { rpc: 'odoo:noteUpdate', fields: {} },
          delete: { rpc: 'odoo:noteDelete', fields: {} },
        },
      },
      opportunity: {
        defaultOperation: 'getAll',
        operations: {
          create: { rpc: 'odoo:opportunityCreate', fields: {} },
          get: { rpc: 'odoo:opportunityGet', fields: {} },
          getAll: { rpc: 'odoo:opportunityGetAll', fields: {} },
          update: { rpc: 'odoo:opportunityUpdate', fields: {} },
          delete: { rpc: 'odoo:opportunityDelete', fields: {} },
        },
      },
    },
  },
  reddit: {
    defaultResource: 'post',
    resources: {
      post: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'reddit:postCreate', fields: {} },
          delete: { rpc: 'reddit:postDelete', fields: {} },
          get: { rpc: 'reddit:postGet', fields: {} },
          getAll: { rpc: 'reddit:postGetAll', fields: {} },
          search: { rpc: 'reddit:postSearch', fields: {} },
        },
      },
      postComment: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'reddit:postCommentCreate', fields: {} },
          delete: { rpc: 'reddit:postCommentDelete', fields: {} },
          getAll: { rpc: 'reddit:postCommentGetAll', fields: {} },
          reply: { rpc: 'reddit:postCommentReply', fields: {} },
        },
      },
      profile: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'reddit:profileGet', fields: {} },
        },
      },
      subreddit: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'reddit:subredditGet', fields: {} },
          getAll: { rpc: 'reddit:subredditGetAll', fields: {} },
        },
      },
      user: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'reddit:userGet', fields: {} },
        },
      },
    },
  },
  strapi: {
    defaultResource: 'entry',
    resources: {
      entry: {
        defaultOperation: 'get',
        operations: {
          create: { rpc: 'strapi:entryCreate', fields: {} },
          get: { rpc: 'strapi:entryGet', fields: {} },
          getAll: { rpc: 'strapi:entryGetAll', fields: {} },
          update: { rpc: 'strapi:entryUpdate', fields: {} },
          delete: { rpc: 'strapi:entryDelete', fields: {} },
        },
      },
    },
  },
  uproc: {
    defaultResource: 'communication',
    resources: {
      audio: {
        defaultOperation: 'perform',
        operations: {
          perform: { rpc: 'uproc:perform', fields: {} },
        },
      },
      communication: {
        defaultOperation: 'perform',
        operations: {
          perform: { rpc: 'uproc:perform', fields: {} },
        },
      },
      company: {
        defaultOperation: 'perform',
        operations: {
          perform: { rpc: 'uproc:perform', fields: {} },
        },
      },
      finance: {
        defaultOperation: 'perform',
        operations: {
          perform: { rpc: 'uproc:perform', fields: {} },
        },
      },
      geographic: {
        defaultOperation: 'perform',
        operations: {
          perform: { rpc: 'uproc:perform', fields: {} },
        },
      },
      image: {
        defaultOperation: 'perform',
        operations: {
          perform: { rpc: 'uproc:perform', fields: {} },
        },
      },
      internet: {
        defaultOperation: 'perform',
        operations: {
          perform: { rpc: 'uproc:perform', fields: {} },
        },
      },
      personal: {
        defaultOperation: 'perform',
        operations: {
          perform: { rpc: 'uproc:perform', fields: {} },
        },
      },
      product: {
        defaultOperation: 'perform',
        operations: {
          perform: { rpc: 'uproc:perform', fields: {} },
        },
      },
      security: {
        defaultOperation: 'perform',
        operations: {
          perform: { rpc: 'uproc:perform', fields: {} },
        },
      },
      text: {
        defaultOperation: 'perform',
        operations: {
          perform: { rpc: 'uproc:perform', fields: {} },
        },
      },
    },
  },
  webflow: {
    defaultResource: 'item',
    resources: {
      item: {
        defaultOperation: 'get',
        operations: {
          create: { rpc: 'webflow:itemCreate', fields: {} },
          deleteItem: { rpc: 'webflow:itemDelete', fields: {} },
          get: { rpc: 'webflow:itemGet', fields: {} },
          getAll: { rpc: 'webflow:itemGetAll', fields: {} },
          update: { rpc: 'webflow:itemUpdate', fields: {} },
        },
      },
    },
  },
  woocommerce: {
    defaultResource: 'product',
    resources: {
      product: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'woocommerce:productCreate', fields: {} },
          get: { rpc: 'woocommerce:productGet', fields: {} },
          getAll: { rpc: 'woocommerce:productGetAll', fields: {} },
          update: { rpc: 'woocommerce:productUpdate', fields: {} },
          delete: { rpc: 'woocommerce:productDelete', fields: {} },
        },
      },
      order: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'woocommerce:orderCreate', fields: {} },
          get: { rpc: 'woocommerce:orderGet', fields: {} },
          getAll: { rpc: 'woocommerce:orderGetAll', fields: {} },
          update: { rpc: 'woocommerce:orderUpdate', fields: {} },
          delete: { rpc: 'woocommerce:orderDelete', fields: {} },
        },
      },
      customer: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'woocommerce:customerCreate', fields: {} },
          get: { rpc: 'woocommerce:customerGet', fields: {} },
          getAll: { rpc: 'woocommerce:customerGetAll', fields: {} },
          update: { rpc: 'woocommerce:customerUpdate', fields: {} },
          delete: { rpc: 'woocommerce:customerDelete', fields: {} },
        },
      },
    },
  },
  zammad: {
    defaultResource: 'user',
    resources: {
      user: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'zammad:userCreate', fields: {} },
          update: { rpc: 'zammad:userUpdate', fields: {} },
          delete: { rpc: 'zammad:userDelete', fields: {} },
          get: { rpc: 'zammad:userGet', fields: {} },
          getAll: { rpc: 'zammad:userGetAll', fields: {} },
          getSelf: { rpc: 'zammad:userGetSelf', fields: {} },
        },
      },
      organization: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'zammad:organizationCreate', fields: {} },
          update: { rpc: 'zammad:organizationUpdate', fields: {} },
          delete: { rpc: 'zammad:organizationDelete', fields: {} },
          get: { rpc: 'zammad:organizationGet', fields: {} },
          getAll: { rpc: 'zammad:organizationGetAll', fields: {} },
        },
      },
      group: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'zammad:groupCreate', fields: {} },
          update: { rpc: 'zammad:groupUpdate', fields: {} },
          delete: { rpc: 'zammad:groupDelete', fields: {} },
          get: { rpc: 'zammad:groupGet', fields: {} },
          getAll: { rpc: 'zammad:groupGetAll', fields: {} },
        },
      },
      ticket: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'zammad:ticketCreate', fields: {} },
          update: { rpc: 'zammad:ticketUpdate', fields: {} },
          delete: { rpc: 'zammad:ticketDelete', fields: {} },
          get: { rpc: 'zammad:ticketGet', fields: {} },
          getAll: { rpc: 'zammad:ticketGetAll', fields: {} },
        },
      },
    },
  },
  bannerbear: {
    defaultResource: 'image',
    resources: {
      image: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'bannerbear:imageCreate', fields: {} },
          get: { rpc: 'bannerbear:imageGet', fields: {} },
        },
      },
      template: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'bannerbear:templateGet', fields: {} },
          getAll: { rpc: 'bannerbear:templateGetAll', fields: {} },
        },
      },
    },
  },
  clickup: {
    defaultResource: 'task',
    resources: {
      task: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'clickup:taskCreate', fields: {} },
          delete: { rpc: 'clickup:taskDelete', fields: {} },
          get: { rpc: 'clickup:taskGet', fields: {} },
          getAll: { rpc: 'clickup:taskGetAll', fields: {} },
          member: { rpc: 'clickup:taskMember', fields: {} },
          setCustomField: { rpc: 'clickup:taskSetCustomField', fields: {} },
          update: { rpc: 'clickup:taskUpdate', fields: {} },
        },
      },
      list: {
        defaultOperation: 'customFields',
        operations: {
          create: { rpc: 'clickup:listCreate', fields: {} },
          customFields: { rpc: 'clickup:listCustomFields', fields: {} },
          delete: { rpc: 'clickup:listDelete', fields: {} },
          get: { rpc: 'clickup:listGet', fields: {} },
          getAll: { rpc: 'clickup:listGetAll', fields: {} },
          member: { rpc: 'clickup:listMember', fields: {} },
          update: { rpc: 'clickup:listUpdate', fields: {} },
        },
      },
      folder: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'clickup:folderCreate', fields: {} },
          delete: { rpc: 'clickup:folderDelete', fields: {} },
          get: { rpc: 'clickup:folderGet', fields: {} },
          getAll: { rpc: 'clickup:folderGetAll', fields: {} },
          update: { rpc: 'clickup:folderUpdate', fields: {} },
        },
      },
      comment: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'clickup:commentCreate', fields: {} },
          delete: { rpc: 'clickup:commentDelete', fields: {} },
          getAll: { rpc: 'clickup:commentGetAll', fields: {} },
          update: { rpc: 'clickup:commentUpdate', fields: {} },
        },
      },
      checklist: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'clickup:checklistCreate', fields: {} },
          delete: { rpc: 'clickup:checklistDelete', fields: {} },
          update: { rpc: 'clickup:checklistUpdate', fields: {} },
        },
      },
      taskTag: {
        defaultOperation: 'add',
        operations: {
          add: { rpc: 'clickup:taskTagAdd', fields: {} },
          remove: { rpc: 'clickup:taskTagRemove', fields: {} },
        },
      },
      timeEntry: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'clickup:timeEntryCreate', fields: {} },
          delete: { rpc: 'clickup:timeEntryDelete', fields: {} },
          get: { rpc: 'clickup:timeEntryGet', fields: {} },
          getAll: { rpc: 'clickup:timeEntryGetAll', fields: {} },
          start: { rpc: 'clickup:timeEntryStart', fields: {} },
          stop: { rpc: 'clickup:timeEntryStop', fields: {} },
          update: { rpc: 'clickup:timeEntryUpdate', fields: {} },
        },
      },
      goal: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'clickup:goalCreate', fields: {} },
          delete: { rpc: 'clickup:goalDelete', fields: {} },
          get: { rpc: 'clickup:goalGet', fields: {} },
          getAll: { rpc: 'clickup:goalGetAll', fields: {} },
          update: { rpc: 'clickup:goalUpdate', fields: {} },
        },
      },
      spaceTag: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'clickup:spaceTagCreate', fields: {} },
          delete: { rpc: 'clickup:spaceTagDelete', fields: {} },
          getAll: { rpc: 'clickup:spaceTagGetAll', fields: {} },
          update: { rpc: 'clickup:spaceTagUpdate', fields: {} },
        },
      },
    },
  },
  copper: {
    defaultResource: 'company',
    resources: {
      company: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'copper:companyCreate', fields: {} },
          delete: { rpc: 'copper:companyDelete', fields: {} },
          get: { rpc: 'copper:companyGet', fields: {} },
          getAll: { rpc: 'copper:companyGetAll', fields: {} },
          update: { rpc: 'copper:companyUpdate', fields: {} },
        },
      },
      customerSource: {
        defaultOperation: 'getAll',
        operations: {
          getAll: { rpc: 'copper:customerSourceGetAll', fields: {} },
        },
      },
      lead: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'copper:leadCreate', fields: {} },
          delete: { rpc: 'copper:leadDelete', fields: {} },
          get: { rpc: 'copper:leadGet', fields: {} },
          getAll: { rpc: 'copper:leadGetAll', fields: {} },
          update: { rpc: 'copper:leadUpdate', fields: {} },
        },
      },
      opportunity: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'copper:opportunityCreate', fields: {} },
          delete: { rpc: 'copper:opportunityDelete', fields: {} },
          get: { rpc: 'copper:opportunityGet', fields: {} },
          getAll: { rpc: 'copper:opportunityGetAll', fields: {} },
          update: { rpc: 'copper:opportunityUpdate', fields: {} },
        },
      },
      person: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'copper:personCreate', fields: {} },
          delete: { rpc: 'copper:personDelete', fields: {} },
          get: { rpc: 'copper:personGet', fields: {} },
          getAll: { rpc: 'copper:personGetAll', fields: {} },
          update: { rpc: 'copper:personUpdate', fields: {} },
        },
      },
      project: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'copper:projectCreate', fields: {} },
          delete: { rpc: 'copper:projectDelete', fields: {} },
          get: { rpc: 'copper:projectGet', fields: {} },
          getAll: { rpc: 'copper:projectGetAll', fields: {} },
          update: { rpc: 'copper:projectUpdate', fields: {} },
        },
      },
      task: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'copper:taskCreate', fields: {} },
          delete: { rpc: 'copper:taskDelete', fields: {} },
          get: { rpc: 'copper:taskGet', fields: {} },
          getAll: { rpc: 'copper:taskGetAll', fields: {} },
          update: { rpc: 'copper:taskUpdate', fields: {} },
        },
      },
      user: {
        defaultOperation: 'getAll',
        operations: {
          getAll: { rpc: 'copper:userGetAll', fields: {} },
        },
      },
    },
  },
  dropcontact: {
    defaultResource: 'contact',
    resources: {
      contact: {
        defaultOperation: 'enrich',
        operations: {
          enrich: { rpc: 'dropcontact:contactEnrich', fields: {} },
          fetchRequest: { rpc: 'dropcontact:contactFetchRequest', fields: {} },
        },
      },
    },
  },
  erpnext: {
    defaultResource: 'document',
    resources: {
      document: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'erpnext:documentCreate', fields: {} },
          get: { rpc: 'erpnext:documentGet', fields: {} },
          getAll: { rpc: 'erpnext:documentGetAll', fields: {} },
          update: { rpc: 'erpnext:documentUpdate', fields: {} },
          delete: { rpc: 'erpnext:documentDelete', fields: {} },
        },
      },
    },
  },
  filemaker: {
    defaultResource: 'record',
    resources: {
      record: {
        defaultOperation: 'record',
        operations: {
          create: { rpc: 'filemaker:recordCreate', fields: {} },
          delete: { rpc: 'filemaker:recordDelete', fields: {} },
          duplicate: { rpc: 'filemaker:recordDuplicate', fields: {} },
          edit: { rpc: 'filemaker:recordEdit', fields: {} },
          find: { rpc: 'filemaker:recordFind', fields: {} },
          records: { rpc: 'filemaker:recordList', fields: {} },
          record: { rpc: 'filemaker:recordGet', fields: {} },
          performscript: { rpc: 'filemaker:recordPerformScript', fields: {} },
        },
      },
    },
  },
  ftp: {
    defaultResource: 'file',
    resources: {
      file: {
        defaultOperation: 'download',
        operations: {
          list: { rpc: 'ftp:fileList', fields: {} },
          download: { rpc: 'ftp:fileDownload', fields: {} },
          upload: { rpc: 'ftp:fileUpload', fields: {} },
          delete: { rpc: 'ftp:fileDelete', fields: {} },
          rename: { rpc: 'ftp:fileRename', fields: {} },
        },
      },
    },
  },
  googletasks: {
    defaultResource: 'task',
    resources: {
      task: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'google-tasks:taskCreate', fields: {} },
          get: { rpc: 'google-tasks:taskGet', fields: {} },
          getAll: { rpc: 'google-tasks:taskGetAll', fields: {} },
          update: { rpc: 'google-tasks:taskUpdate', fields: {} },
          delete: { rpc: 'google-tasks:taskDelete', fields: {} },
        },
      },
    },
  },
  mailchimp: {
    defaultResource: 'member',
    resources: {
      member: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'mailchimp:memberCreate', fields: {} },
          delete: { rpc: 'mailchimp:memberDelete', fields: {} },
          get: { rpc: 'mailchimp:memberGet', fields: {} },
          getAll: { rpc: 'mailchimp:memberGetAll', fields: {} },
          update: { rpc: 'mailchimp:memberUpdate', fields: {} },
        },
      },
      memberTag: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'mailchimp:memberTagCreate', fields: {} },
          delete: { rpc: 'mailchimp:memberTagDelete', fields: {} },
        },
      },
      listGroup: {
        defaultOperation: 'getAll',
        operations: {
          getAll: { rpc: 'mailchimp:listGroupGetAll', fields: {} },
        },
      },
      campaign: {
        defaultOperation: 'getAll',
        operations: {
          getAll: { rpc: 'mailchimp:campaignGetAll', fields: {} },
          get: { rpc: 'mailchimp:campaignGet', fields: {} },
          delete: { rpc: 'mailchimp:campaignDelete', fields: {} },
          send: { rpc: 'mailchimp:campaignSend', fields: {} },
          replicate: { rpc: 'mailchimp:campaignReplicate', fields: {} },
          resend: { rpc: 'mailchimp:campaignResend', fields: {} },
        },
      },
    },
  },
  matrix: {
    defaultResource: 'message',
    resources: {
      account: {
        defaultOperation: 'me',
        operations: {
          me: { rpc: 'matrix:accountWhoami', fields: {} },
        },
      },
      event: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'matrix:eventGet', fields: {} },
        },
      },
      media: {
        defaultOperation: 'upload',
        operations: {
          upload: { rpc: 'matrix:mediaUpload', fields: {} },
        },
      },
      message: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'matrix:messageSend', fields: {} },
          getAll: { rpc: 'matrix:messageGetAll', fields: {} },
        },
      },
      room: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'matrix:roomCreate', fields: {} },
          invite: { rpc: 'matrix:roomInvite', fields: {} },
          join: { rpc: 'matrix:roomJoin', fields: {} },
          kick: { rpc: 'matrix:roomKick', fields: {} },
          leave: { rpc: 'matrix:roomLeave', fields: {} },
        },
      },
      roomMember: {
        defaultOperation: 'getAll',
        operations: {
          getAll: { rpc: 'matrix:roomMemberGetAll', fields: {} },
        },
      },
    },
  },
  microsoftonedrive: {
    defaultResource: 'file',
    resources: {
      file: {
        defaultOperation: 'upload',
        operations: {
          copy: { rpc: 'microsoft-one-drive:fileCopy', fields: {} },
          delete: { rpc: 'microsoft-one-drive:fileDelete', fields: {} },
          download: { rpc: 'microsoft-one-drive:fileDownload', fields: {} },
          get: { rpc: 'microsoft-one-drive:fileGet', fields: {} },
          move: { rpc: 'microsoft-one-drive:fileMove', fields: {} },
          rename: { rpc: 'microsoft-one-drive:fileRename', fields: {} },
          search: { rpc: 'microsoft-one-drive:fileSearch', fields: {} },
          share: { rpc: 'microsoft-one-drive:fileShare', fields: {} },
          upload: { rpc: 'microsoft-one-drive:fileUpload', fields: {} },
        },
      },
      folder: {
        defaultOperation: 'getChildren',
        operations: {
          create: { rpc: 'microsoft-one-drive:folderCreate', fields: {} },
          delete: { rpc: 'microsoft-one-drive:folderDelete', fields: {} },
          getChildren: {
            rpc: 'microsoft-one-drive:folderGetChildren',
            fields: {},
          },
          move: { rpc: 'microsoft-one-drive:folderMove', fields: {} },
          rename: { rpc: 'microsoft-one-drive:folderRename', fields: {} },
          search: { rpc: 'microsoft-one-drive:folderSearch', fields: {} },
          share: { rpc: 'microsoft-one-drive:folderShare', fields: {} },
        },
      },
    },
  },
  microsoftteams: {
    defaultResource: 'channel',
    resources: {
      channel: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'microsoft-teams:channelCreate', fields: {} },
          deleteChannel: { rpc: 'microsoft-teams:channelDelete', fields: {} },
          get: { rpc: 'microsoft-teams:channelGet', fields: {} },
          getAll: { rpc: 'microsoft-teams:channelGetAll', fields: {} },
          update: { rpc: 'microsoft-teams:channelUpdate', fields: {} },
        },
      },
      channelMessage: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'microsoft-teams:channelMessageCreate', fields: {} },
          getAll: { rpc: 'microsoft-teams:channelMessageGetAll', fields: {} },
        },
      },
      chatMessage: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'microsoft-teams:chatMessageCreate', fields: {} },
          get: { rpc: 'microsoft-teams:chatMessageGet', fields: {} },
          getAll: { rpc: 'microsoft-teams:chatMessageGetAll', fields: {} },
          sendAndWait: {
            rpc: 'microsoft-teams:chatMessageSendAndWait',
            fields: {},
          },
        },
      },
      task: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'microsoft-teams:taskCreate', fields: {} },
          deleteTask: { rpc: 'microsoft-teams:taskDelete', fields: {} },
          get: { rpc: 'microsoft-teams:taskGet', fields: {} },
          getAll: { rpc: 'microsoft-teams:taskGetAll', fields: {} },
          update: { rpc: 'microsoft-teams:taskUpdate', fields: {} },
        },
      },
    },
  },
  mindee: {
    defaultResource: 'receipt',
    resources: {
      receipt: {
        defaultOperation: 'predict',
        operations: {
          predict: { rpc: 'mindee:receiptPredict', fields: {} },
        },
      },
      invoice: {
        defaultOperation: 'predict',
        operations: {
          predict: { rpc: 'mindee:invoicePredict', fields: {} },
        },
      },
    },
  },
  orbit: {
    defaultResource: 'member',
    resources: {
      activity: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'orbit:activityCreate', fields: {} },
          getAll: { rpc: 'orbit:activityGetAll', fields: {} },
        },
      },
      member: {
        defaultOperation: 'get',
        operations: {
          upsert: { rpc: 'orbit:memberUpsert', fields: {} },
          delete: { rpc: 'orbit:memberDelete', fields: {} },
          get: { rpc: 'orbit:memberGet', fields: {} },
          getAll: { rpc: 'orbit:memberGetAll', fields: {} },
          lookup: { rpc: 'orbit:memberLookup', fields: {} },
          update: { rpc: 'orbit:memberUpdate', fields: {} },
        },
      },
      note: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'orbit:noteCreate', fields: {} },
          getAll: { rpc: 'orbit:noteGetAll', fields: {} },
          update: { rpc: 'orbit:noteUpdate', fields: {} },
        },
      },
      post: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'orbit:postCreate', fields: {} },
          getAll: { rpc: 'orbit:postGetAll', fields: {} },
          delete: { rpc: 'orbit:postDelete', fields: {} },
        },
      },
    },
  },
  phantombuster: {
    defaultResource: 'agent',
    resources: {
      agent: {
        defaultOperation: 'launch',
        operations: {
          getAll: { rpc: 'phantombuster:agentGetAll', fields: {} },
          get: { rpc: 'phantombuster:agentGet', fields: {} },
          getOutput: { rpc: 'phantombuster:agentGetOutput', fields: {} },
          delete: { rpc: 'phantombuster:agentDelete', fields: {} },
          launch: { rpc: 'phantombuster:agentLaunch', fields: {} },
          launchSync: { rpc: 'phantombuster:agentLaunchSync', fields: {} },
        },
      },
    },
  },
  quickchart: {
    defaultResource: 'chart',
    resources: {
      chart: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'quickchart:chartCreate', fields: {} },
        },
      },
    },
  },
  signl4: {
    defaultResource: 'alert',
    resources: {
      alert: {
        defaultOperation: 'send',
        operations: {
          send: { rpc: 'signl4:alertSend', fields: {} },
          resolve: { rpc: 'signl4:alertResolve', fields: {} },
        },
      },
    },
  },
  trello: {
    defaultResource: 'card',
    resources: {
      board: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'trello:boardCreate', fields: {} },
          delete: { rpc: 'trello:boardDelete', fields: {} },
          get: { rpc: 'trello:boardGet', fields: {} },
          update: { rpc: 'trello:boardUpdate', fields: {} },
        },
      },
      boardMember: {
        defaultOperation: 'add',
        operations: {
          add: { rpc: 'trello:boardMemberAdd', fields: {} },
          getAll: { rpc: 'trello:boardMemberGetAll', fields: {} },
          invite: { rpc: 'trello:boardMemberInvite', fields: {} },
          remove: { rpc: 'trello:boardMemberRemove', fields: {} },
        },
      },
      card: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'trello:cardCreate', fields: {} },
          delete: { rpc: 'trello:cardDelete', fields: {} },
          get: { rpc: 'trello:cardGet', fields: {} },
          update: { rpc: 'trello:cardUpdate', fields: {} },
        },
      },
      cardComment: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'trello:cardCommentCreate', fields: {} },
          delete: { rpc: 'trello:cardCommentDelete', fields: {} },
          update: { rpc: 'trello:cardCommentUpdate', fields: {} },
        },
      },
      list: {
        defaultOperation: 'create',
        operations: {
          archive: { rpc: 'trello:listArchive', fields: {} },
          create: { rpc: 'trello:listCreate', fields: {} },
          get: { rpc: 'trello:listGet', fields: {} },
          getAll: { rpc: 'trello:listGetAll', fields: {} },
          getCards: { rpc: 'trello:listGetCards', fields: {} },
          update: { rpc: 'trello:listUpdate', fields: {} },
        },
      },
      checklist: {
        defaultOperation: 'getAll',
        operations: {
          create: { rpc: 'trello:checklistCreate', fields: {} },
          createCheckItem: {
            rpc: 'trello:checklistCreateCheckItem',
            fields: {},
          },
          delete: { rpc: 'trello:checklistDelete', fields: {} },
          deleteCheckItem: {
            rpc: 'trello:checklistDeleteCheckItem',
            fields: {},
          },
          get: { rpc: 'trello:checklistGet', fields: {} },
          getAll: { rpc: 'trello:checklistGetAll', fields: {} },
          getCheckItem: { rpc: 'trello:checklistGetCheckItem', fields: {} },
          completedCheckItems: {
            rpc: 'trello:checklistCompletedCheckItems',
            fields: {},
          },
          updateCheckItem: {
            rpc: 'trello:checklistUpdateCheckItem',
            fields: {},
          },
        },
      },
      label: {
        defaultOperation: 'getAll',
        operations: {
          addLabel: { rpc: 'trello:labelAddLabel', fields: {} },
          create: { rpc: 'trello:labelCreate', fields: {} },
          delete: { rpc: 'trello:labelDelete', fields: {} },
          get: { rpc: 'trello:labelGet', fields: {} },
          getAll: { rpc: 'trello:labelGetAll', fields: {} },
          removeLabel: { rpc: 'trello:labelRemoveLabel', fields: {} },
          update: { rpc: 'trello:labelUpdate', fields: {} },
        },
      },
      attachment: {
        defaultOperation: 'getAll',
        operations: {
          create: { rpc: 'trello:attachmentCreate', fields: {} },
          delete: { rpc: 'trello:attachmentDelete', fields: {} },
          get: { rpc: 'trello:attachmentGet', fields: {} },
          getAll: { rpc: 'trello:attachmentGetAll', fields: {} },
        },
      },
    },
  },
  venafitlsprotectcloud: {
    defaultResource: 'certificateRequest',
    resources: {
      certificateRequest: {
        defaultOperation: 'create',
        operations: {
          create: {
            rpc: 'venafi-tls-protect-cloud:certificateRequestCreate',
            fields: {},
          },
          get: {
            rpc: 'venafi-tls-protect-cloud:certificateRequestGet',
            fields: {},
          },
          getMany: {
            rpc: 'venafi-tls-protect-cloud:certificateRequestGetMany',
            fields: {},
          },
        },
      },
      certificate: {
        defaultOperation: 'delete',
        operations: {
          delete: {
            rpc: 'venafi-tls-protect-cloud:certificateDelete',
            fields: {},
          },
          download: {
            rpc: 'venafi-tls-protect-cloud:certificateDownload',
            fields: {},
          },
          get: { rpc: 'venafi-tls-protect-cloud:certificateGet', fields: {} },
          getMany: {
            rpc: 'venafi-tls-protect-cloud:certificateGetMany',
            fields: {},
          },
          renew: {
            rpc: 'venafi-tls-protect-cloud:certificateRenew',
            fields: {},
          },
        },
      },
    },
  },
  zoom: {
    defaultResource: 'meeting',
    resources: {
      meeting: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'zoom:meetingCreate', fields: {} },
          get: { rpc: 'zoom:meetingGet', fields: {} },
          getAll: { rpc: 'zoom:meetingGetAll', fields: {} },
          update: { rpc: 'zoom:meetingUpdate', fields: {} },
          delete: { rpc: 'zoom:meetingDelete', fields: {} },
        },
      },
    },
  },
  agilecrm: {
    defaultResource: 'contact',
    resources: {
      contact: {
        defaultOperation: 'get',
        operations: {
          create: { rpc: 'agile-crm:contactCreate', fields: {} },
          delete: { rpc: 'agile-crm:contactDelete', fields: {} },
          get: { rpc: 'agile-crm:contactGet', fields: {} },
          getAll: { rpc: 'agile-crm:contactGetAll', fields: {} },
          update: { rpc: 'agile-crm:contactUpdate', fields: {} },
        },
      },
      company: {
        defaultOperation: 'get',
        operations: {
          create: { rpc: 'agile-crm:companyCreate', fields: {} },
          delete: { rpc: 'agile-crm:companyDelete', fields: {} },
          get: { rpc: 'agile-crm:companyGet', fields: {} },
          getAll: { rpc: 'agile-crm:companyGetAll', fields: {} },
          update: { rpc: 'agile-crm:companyUpdate', fields: {} },
        },
      },
      deal: {
        defaultOperation: 'get',
        operations: {
          create: { rpc: 'agile-crm:dealCreate', fields: {} },
          delete: { rpc: 'agile-crm:dealDelete', fields: {} },
          get: { rpc: 'agile-crm:dealGet', fields: {} },
          getAll: { rpc: 'agile-crm:dealGetAll', fields: {} },
          update: { rpc: 'agile-crm:dealUpdate', fields: {} },
        },
      },
    },
  },
  automizy: {
    defaultResource: 'contact',
    resources: {
      contact: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'automizy:contactCreate', fields: {} },
          delete: { rpc: 'automizy:contactDelete', fields: {} },
          get: { rpc: 'automizy:contactGet', fields: {} },
          getAll: { rpc: 'automizy:contactGetAll', fields: {} },
          update: { rpc: 'automizy:contactUpdate', fields: {} },
        },
      },
      list: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'automizy:listCreate', fields: {} },
          delete: { rpc: 'automizy:listDelete', fields: {} },
          get: { rpc: 'automizy:listGet', fields: {} },
          getAll: { rpc: 'automizy:listGetAll', fields: {} },
          update: { rpc: 'automizy:listUpdate', fields: {} },
        },
      },
    },
  },
  autopilot: {
    defaultResource: 'contact',
    resources: {
      contact: {
        defaultOperation: 'upsert',
        operations: {
          upsert: { rpc: 'autopilot:contactUpsert', fields: {} },
          delete: { rpc: 'autopilot:contactDelete', fields: {} },
          get: { rpc: 'autopilot:contactGet', fields: {} },
          getAll: { rpc: 'autopilot:contactGetAll', fields: {} },
        },
      },
      contactJourney: {
        defaultOperation: 'add',
        operations: {
          add: { rpc: 'autopilot:contactJourneyAdd', fields: {} },
        },
      },
      contactList: {
        defaultOperation: 'add',
        operations: {
          add: { rpc: 'autopilot:contactListAdd', fields: {} },
          remove: { rpc: 'autopilot:contactListRemove', fields: {} },
          exist: { rpc: 'autopilot:contactListExist', fields: {} },
          getAll: { rpc: 'autopilot:contactListGetAll', fields: {} },
        },
      },
      list: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'autopilot:listCreate', fields: {} },
          getAll: { rpc: 'autopilot:listGetAll', fields: {} },
        },
      },
    },
  },
  awsses: {
    defaultResource: 'email',
    resources: {
      email: {
        defaultOperation: 'send',
        operations: {
          send: { rpc: 'aws-ses:emailSend', fields: {} },
          sendTemplate: { rpc: 'aws-ses:emailSendTemplate', fields: {} },
        },
      },
      template: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'aws-ses:templateCreate', fields: {} },
          delete: { rpc: 'aws-ses:templateDelete', fields: {} },
          get: { rpc: 'aws-ses:templateGet', fields: {} },
          getAll: { rpc: 'aws-ses:templateGetAll', fields: {} },
          update: { rpc: 'aws-ses:templateUpdate', fields: {} },
        },
      },
      customVerificationEmail: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'aws-ses:customVerificationEmailCreate', fields: {} },
          delete: { rpc: 'aws-ses:customVerificationEmailDelete', fields: {} },
          get: { rpc: 'aws-ses:customVerificationEmailGet', fields: {} },
          getAll: { rpc: 'aws-ses:customVerificationEmailGetAll', fields: {} },
          send: { rpc: 'aws-ses:customVerificationEmailSend', fields: {} },
          update: { rpc: 'aws-ses:customVerificationEmailUpdate', fields: {} },
        },
      },
    },
  },
  awstranscribe: {
    defaultResource: 'transcriptionJob',
    resources: {
      transcriptionJob: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'aws-transcribe:transcriptionJobCreate', fields: {} },
          get: { rpc: 'aws-transcribe:transcriptionJobGet', fields: {} },
          getAll: { rpc: 'aws-transcribe:transcriptionJobGetAll', fields: {} },
          delete: { rpc: 'aws-transcribe:transcriptionJobDelete', fields: {} },
        },
      },
    },
  },
  bitwarden: {
    defaultResource: 'collection',
    resources: {
      collection: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'bitwarden:collectionGet', fields: {} },
          getAll: { rpc: 'bitwarden:collectionGetAll', fields: {} },
          update: { rpc: 'bitwarden:collectionUpdate', fields: {} },
          delete: { rpc: 'bitwarden:collectionDelete', fields: {} },
        },
      },
      event: {
        defaultOperation: 'getAll',
        operations: {
          getAll: { rpc: 'bitwarden:eventGetAll', fields: {} },
        },
      },
      group: {
        defaultOperation: 'get',
        operations: {
          create: { rpc: 'bitwarden:groupCreate', fields: {} },
          get: { rpc: 'bitwarden:groupGet', fields: {} },
          getAll: { rpc: 'bitwarden:groupGetAll', fields: {} },
          getMembers: { rpc: 'bitwarden:groupGetMembers', fields: {} },
          update: { rpc: 'bitwarden:groupUpdate', fields: {} },
          updateMembers: { rpc: 'bitwarden:groupUpdateMembers', fields: {} },
          delete: { rpc: 'bitwarden:groupDelete', fields: {} },
        },
      },
      member: {
        defaultOperation: 'get',
        operations: {
          create: { rpc: 'bitwarden:memberCreate', fields: {} },
          get: { rpc: 'bitwarden:memberGet', fields: {} },
          getAll: { rpc: 'bitwarden:memberGetAll', fields: {} },
          getGroups: { rpc: 'bitwarden:memberGetGroups', fields: {} },
          update: { rpc: 'bitwarden:memberUpdate', fields: {} },
          updateGroups: { rpc: 'bitwarden:memberUpdateGroups', fields: {} },
          delete: { rpc: 'bitwarden:memberDelete', fields: {} },
        },
      },
    },
  },
  cortex: {
    defaultResource: 'analyzer',
    resources: {
      analyzer: {
        defaultOperation: 'execute',
        operations: {
          execute: { rpc: 'cortex:analyzerExecute', fields: {} },
        },
      },
      job: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'cortex:jobGet', fields: {} },
          report: { rpc: 'cortex:jobReport', fields: {} },
        },
      },
      responder: {
        defaultOperation: 'execute',
        operations: {
          execute: { rpc: 'cortex:responderExecute', fields: {} },
        },
      },
    },
  },
  cratedb: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'insert',
        operations: {
          executeQuery: { rpc: 'cratedb:executeQuery', fields: {} },
          insert: { rpc: 'cratedb:insert', fields: {} },
          update: { rpc: 'cratedb:update', fields: {} },
        },
      },
    },
  },
  elasticsearch: {
    defaultResource: 'document',
    resources: {
      document: {
        defaultOperation: 'get',
        operations: {
          create: { rpc: 'elasticsearch:documentCreate', fields: {} },
          delete: { rpc: 'elasticsearch:documentDelete', fields: {} },
          get: { rpc: 'elasticsearch:documentGet', fields: {} },
          getAll: { rpc: 'elasticsearch:documentGetAll', fields: {} },
          update: { rpc: 'elasticsearch:documentUpdate', fields: {} },
        },
      },
      index: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'elasticsearch:indexCreate', fields: {} },
          delete: { rpc: 'elasticsearch:indexDelete', fields: {} },
          get: { rpc: 'elasticsearch:indexGet', fields: {} },
          getAll: { rpc: 'elasticsearch:indexGetAll', fields: {} },
        },
      },
    },
  },
  emelia: {
    defaultResource: 'campaign',
    resources: {
      campaign: {
        defaultOperation: 'get',
        operations: {
          create: { rpc: 'emelia:campaignCreate', fields: {} },
          get: { rpc: 'emelia:campaignGet', fields: {} },
          getAll: { rpc: 'emelia:campaignGetAll', fields: {} },
          addContact: { rpc: 'emelia:campaignAddContact', fields: {} },
          pause: { rpc: 'emelia:campaignPause', fields: {} },
          start: { rpc: 'emelia:campaignStart', fields: {} },
          duplicate: { rpc: 'emelia:campaignDuplicate', fields: {} },
        },
      },
      contactList: {
        defaultOperation: 'getAll',
        operations: {
          add: { rpc: 'emelia:contactListAdd', fields: {} },
          getAll: { rpc: 'emelia:contactListGetAll', fields: {} },
        },
      },
    },
  },
  ghost: {
    defaultResource: 'post',
    resources: {
      post: {
        defaultOperation: 'get',
        operations: {
          create: { rpc: 'ghost:postCreate', fields: {} },
          delete: { rpc: 'ghost:postDelete', fields: {} },
          get: { rpc: 'ghost:postGet', fields: {} },
          getAll: { rpc: 'ghost:postGetAll', fields: {} },
          update: { rpc: 'ghost:postUpdate', fields: {} },
        },
      },
    },
  },
  googlecontacts: {
    defaultResource: 'contact',
    resources: {
      contact: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'google-contacts:contactCreate', fields: {} },
          get: { rpc: 'google-contacts:contactGet', fields: {} },
          getAll: { rpc: 'google-contacts:contactGetAll', fields: {} },
          update: { rpc: 'google-contacts:contactUpdate', fields: {} },
          delete: { rpc: 'google-contacts:contactDelete', fields: {} },
        },
      },
    },
  },
  googleslides: {
    defaultResource: 'presentation',
    resources: {
      presentation: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'google-slides:presentationCreate', fields: {} },
          get: { rpc: 'google-slides:presentationGet', fields: {} },
          getSlides: { rpc: 'google-slides:presentationGetSlides', fields: {} },
          replaceText: {
            rpc: 'google-slides:presentationReplaceText',
            fields: {},
          },
        },
      },
      page: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'google-slides:pageGet', fields: {} },
          getThumbnail: { rpc: 'google-slides:pageGetThumbnail', fields: {} },
        },
      },
    },
  },
  lingvanex: {
    defaultResource: 'translate',
    resources: {
      translate: {
        defaultOperation: 'translate',
        operations: {
          translate: { rpc: 'lingvanex:translate', fields: {} },
        },
      },
    },
  },
  mailerlite: {
    defaultResource: 'subscriber',
    resources: {
      subscriber: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'mailer-lite:subscriberCreate', fields: {} },
          get: { rpc: 'mailer-lite:subscriberGet', fields: {} },
          getAll: { rpc: 'mailer-lite:subscriberGetAll', fields: {} },
          update: { rpc: 'mailer-lite:subscriberUpdate', fields: {} },
        },
      },
    },
  },
  microsoftexcel: {
    defaultResource: 'workbook',
    resources: {
      workbook: {
        defaultOperation: 'getAll',
        operations: {
          addWorksheet: {
            rpc: 'microsoft-excel:workbookAddWorksheet',
            fields: {},
          },
          deleteWorkbook: { rpc: 'microsoft-excel:workbookDelete', fields: {} },
          getAll: { rpc: 'microsoft-excel:workbookGetAll', fields: {} },
        },
      },
      worksheet: {
        defaultOperation: 'getAll',
        operations: {
          append: { rpc: 'microsoft-excel:worksheetAppend', fields: {} },
          upsert: { rpc: 'microsoft-excel:worksheetUpsert', fields: {} },
          clear: { rpc: 'microsoft-excel:worksheetClear', fields: {} },
          deleteWorksheet: {
            rpc: 'microsoft-excel:worksheetDelete',
            fields: {},
          },
          getAll: { rpc: 'microsoft-excel:worksheetGetAll', fields: {} },
          readRows: { rpc: 'microsoft-excel:worksheetReadRows', fields: {} },
          update: { rpc: 'microsoft-excel:worksheetUpdate', fields: {} },
        },
      },
      table: {
        defaultOperation: 'append',
        operations: {
          append: { rpc: 'microsoft-excel:tableAppend', fields: {} },
          convertToRange: {
            rpc: 'microsoft-excel:tableConvertToRange',
            fields: {},
          },
          addTable: { rpc: 'microsoft-excel:tableCreate', fields: {} },
          deleteTable: { rpc: 'microsoft-excel:tableDelete', fields: {} },
          getColumns: { rpc: 'microsoft-excel:tableGetColumns', fields: {} },
          getRows: { rpc: 'microsoft-excel:tableGetRows', fields: {} },
          lookup: { rpc: 'microsoft-excel:tableLookup', fields: {} },
        },
      },
    },
  },
  microsofttodo: {
    defaultResource: 'task',
    resources: {
      task: {
        defaultOperation: 'get',
        operations: {
          create: { rpc: 'microsoft-to-do:taskCreate', fields: {} },
          delete: { rpc: 'microsoft-to-do:taskDelete', fields: {} },
          get: { rpc: 'microsoft-to-do:taskGet', fields: {} },
          getAll: { rpc: 'microsoft-to-do:taskGetAll', fields: {} },
          update: { rpc: 'microsoft-to-do:taskUpdate', fields: {} },
        },
      },
      list: {
        defaultOperation: 'get',
        operations: {
          create: { rpc: 'microsoft-to-do:listCreate', fields: {} },
          delete: { rpc: 'microsoft-to-do:listDelete', fields: {} },
          get: { rpc: 'microsoft-to-do:listGet', fields: {} },
          getAll: { rpc: 'microsoft-to-do:listGetAll', fields: {} },
          update: { rpc: 'microsoft-to-do:listUpdate', fields: {} },
        },
      },
      linkedResource: {
        defaultOperation: 'get',
        operations: {
          create: { rpc: 'microsoft-to-do:linkedResourceCreate', fields: {} },
          delete: { rpc: 'microsoft-to-do:linkedResourceDelete', fields: {} },
          get: { rpc: 'microsoft-to-do:linkedResourceGet', fields: {} },
          getAll: { rpc: 'microsoft-to-do:linkedResourceGetAll', fields: {} },
          update: { rpc: 'microsoft-to-do:linkedResourceUpdate', fields: {} },
        },
      },
    },
  },
  postbin: {
    defaultResource: 'bin',
    resources: {
      bin: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'postbin:binCreate', fields: {} },
          get: { rpc: 'postbin:binGet', fields: {} },
          delete: { rpc: 'postbin:binDelete', fields: {} },
        },
      },
      request: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'postbin:requestGet', fields: {} },
          removeFirst: { rpc: 'postbin:requestShift', fields: {} },
          send: { rpc: 'postbin:requestSend', fields: {} },
        },
      },
    },
  },
  quickbooks: {
    defaultResource: 'customer',
    resources: {
      customer: {
        defaultOperation: 'get',
        operations: {
          create: { rpc: 'quickbooks:customerCreate', fields: {} },
          get: { rpc: 'quickbooks:customerGet', fields: {} },
          getAll: { rpc: 'quickbooks:customerGetAll', fields: {} },
          update: { rpc: 'quickbooks:customerUpdate', fields: {} },
        },
      },
      invoice: {
        defaultOperation: 'get',
        operations: {
          create: { rpc: 'quickbooks:invoiceCreate', fields: {} },
          get: { rpc: 'quickbooks:invoiceGet', fields: {} },
          getAll: { rpc: 'quickbooks:invoiceGetAll', fields: {} },
          update: { rpc: 'quickbooks:invoiceUpdate', fields: {} },
        },
      },
      item: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'quickbooks:itemGet', fields: {} },
          getAll: { rpc: 'quickbooks:itemGetAll', fields: {} },
        },
      },
      payment: {
        defaultOperation: 'get',
        operations: {
          create: { rpc: 'quickbooks:paymentCreate', fields: {} },
          get: { rpc: 'quickbooks:paymentGet', fields: {} },
          getAll: { rpc: 'quickbooks:paymentGetAll', fields: {} },
          update: { rpc: 'quickbooks:paymentUpdate', fields: {} },
        },
      },
      bill: {
        defaultOperation: 'get',
        operations: {
          create: { rpc: 'quickbooks:billCreate', fields: {} },
          get: { rpc: 'quickbooks:billGet', fields: {} },
          getAll: { rpc: 'quickbooks:billGetAll', fields: {} },
          update: { rpc: 'quickbooks:billUpdate', fields: {} },
        },
      },
      estimate: {
        defaultOperation: 'get',
        operations: {
          create: { rpc: 'quickbooks:estimateCreate', fields: {} },
          get: { rpc: 'quickbooks:estimateGet', fields: {} },
          getAll: { rpc: 'quickbooks:estimateGetAll', fields: {} },
          update: { rpc: 'quickbooks:estimateUpdate', fields: {} },
        },
      },
      employee: {
        defaultOperation: 'get',
        operations: {
          create: { rpc: 'quickbooks:employeeCreate', fields: {} },
          get: { rpc: 'quickbooks:employeeGet', fields: {} },
          getAll: { rpc: 'quickbooks:employeeGetAll', fields: {} },
          update: { rpc: 'quickbooks:employeeUpdate', fields: {} },
        },
      },
      vendor: {
        defaultOperation: 'get',
        operations: {
          create: { rpc: 'quickbooks:vendorCreate', fields: {} },
          get: { rpc: 'quickbooks:vendorGet', fields: {} },
          getAll: { rpc: 'quickbooks:vendorGetAll', fields: {} },
          update: { rpc: 'quickbooks:vendorUpdate', fields: {} },
        },
      },
      transaction: {
        defaultOperation: 'getReport',
        operations: {
          getReport: { rpc: 'quickbooks:transactionGetReport', fields: {} },
        },
      },
    },
  },
  raindrop: {
    defaultResource: 'collection',
    resources: {
      bookmark: {
        defaultOperation: 'get',
        operations: {
          create: { rpc: 'raindrop:bookmarkCreate', fields: {} },
          delete: { rpc: 'raindrop:bookmarkDelete', fields: {} },
          get: { rpc: 'raindrop:bookmarkGet', fields: {} },
          getAll: { rpc: 'raindrop:bookmarkGetAll', fields: {} },
          update: { rpc: 'raindrop:bookmarkUpdate', fields: {} },
        },
      },
      collection: {
        defaultOperation: 'get',
        operations: {
          create: { rpc: 'raindrop:collectionCreate', fields: {} },
          delete: { rpc: 'raindrop:collectionDelete', fields: {} },
          get: { rpc: 'raindrop:collectionGet', fields: {} },
          getAll: { rpc: 'raindrop:collectionGetAll', fields: {} },
          update: { rpc: 'raindrop:collectionUpdate', fields: {} },
        },
      },
      tag: {
        defaultOperation: 'getAll',
        operations: {
          delete: { rpc: 'raindrop:tagDelete', fields: {} },
          getAll: { rpc: 'raindrop:tagGetAll', fields: {} },
        },
      },
      user: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'raindrop:userGet', fields: {} },
        },
      },
    },
  },
  servicenow: {
    defaultResource: 'user',
    resources: {
      attachment: {
        defaultOperation: 'upload',
        operations: {
          get: { rpc: 'servicenow:attachmentGet', fields: {} },
          getAll: { rpc: 'servicenow:attachmentGetAll', fields: {} },
          upload: { rpc: 'servicenow:attachmentUpload', fields: {} },
          delete: { rpc: 'servicenow:attachmentDelete', fields: {} },
        },
      },
      businessService: {
        defaultOperation: 'getAll',
        operations: {
          getAll: { rpc: 'servicenow:businessServiceGetAll', fields: {} },
        },
      },
      configurationItems: {
        defaultOperation: 'getAll',
        operations: {
          getAll: { rpc: 'servicenow:configurationItemGetAll', fields: {} },
        },
      },
      department: {
        defaultOperation: 'getAll',
        operations: {
          getAll: { rpc: 'servicenow:departmentGetAll', fields: {} },
        },
      },
      dictionary: {
        defaultOperation: 'getAll',
        operations: {
          getAll: { rpc: 'servicenow:dictionaryGetAll', fields: {} },
        },
      },
      incident: {
        defaultOperation: 'get',
        operations: {
          create: { rpc: 'servicenow:incidentCreate', fields: {} },
          delete: { rpc: 'servicenow:incidentDelete', fields: {} },
          get: { rpc: 'servicenow:incidentGet', fields: {} },
          getAll: { rpc: 'servicenow:incidentGetAll', fields: {} },
          update: { rpc: 'servicenow:incidentUpdate', fields: {} },
        },
      },
      tableRecord: {
        defaultOperation: 'get',
        operations: {
          create: { rpc: 'servicenow:tableRecordCreate', fields: {} },
          delete: { rpc: 'servicenow:tableRecordDelete', fields: {} },
          get: { rpc: 'servicenow:tableRecordGet', fields: {} },
          getAll: { rpc: 'servicenow:tableRecordGetAll', fields: {} },
          update: { rpc: 'servicenow:tableRecordUpdate', fields: {} },
        },
      },
      user: {
        defaultOperation: 'get',
        operations: {
          create: { rpc: 'servicenow:userCreate', fields: {} },
          delete: { rpc: 'servicenow:userDelete', fields: {} },
          get: { rpc: 'servicenow:userGet', fields: {} },
          getAll: { rpc: 'servicenow:userGetAll', fields: {} },
          update: { rpc: 'servicenow:userUpdate', fields: {} },
        },
      },
      userGroup: {
        defaultOperation: 'getAll',
        operations: {
          getAll: { rpc: 'servicenow:userGroupGetAll', fields: {} },
        },
      },
      userRole: {
        defaultOperation: 'getAll',
        operations: {
          getAll: { rpc: 'servicenow:userRoleGetAll', fields: {} },
        },
      },
    },
  },
  strava: {
    defaultResource: 'activity',
    resources: {
      activity: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'strava:activityCreate', fields: {} },
          get: { rpc: 'strava:activityGet', fields: {} },
          getAll: { rpc: 'strava:activityGetAll', fields: {} },
          update: { rpc: 'strava:activityUpdate', fields: {} },
          getComments: { rpc: 'strava:activityGetComments', fields: {} },
          getKudos: { rpc: 'strava:activityGetKudos', fields: {} },
          getLaps: { rpc: 'strava:activityGetLaps', fields: {} },
          getZones: { rpc: 'strava:activityGetZones', fields: {} },
        },
      },
    },
  },
  vonage: {
    defaultResource: 'sms',
    resources: {
      sms: {
        defaultOperation: 'send',
        operations: {
          send: { rpc: 'vonage:smsSend', fields: {} },
        },
      },
    },
  },
  wekan: {
    defaultResource: 'card',
    resources: {
      board: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'wekan:boardCreate', fields: {} },
          delete: { rpc: 'wekan:boardDelete', fields: {} },
          get: { rpc: 'wekan:boardGet', fields: {} },
          getAll: { rpc: 'wekan:boardGetAll', fields: {} },
        },
      },
      card: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'wekan:cardCreate', fields: {} },
          delete: { rpc: 'wekan:cardDelete', fields: {} },
          get: { rpc: 'wekan:cardGet', fields: {} },
          getAll: { rpc: 'wekan:cardGetAll', fields: {} },
          update: { rpc: 'wekan:cardUpdate', fields: {} },
        },
      },
      cardComment: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'wekan:cardCommentCreate', fields: {} },
          delete: { rpc: 'wekan:cardCommentDelete', fields: {} },
          get: { rpc: 'wekan:cardCommentGet', fields: {} },
          getAll: { rpc: 'wekan:cardCommentGetAll', fields: {} },
        },
      },
      checklist: {
        defaultOperation: 'getAll',
        operations: {
          create: { rpc: 'wekan:checklistCreate', fields: {} },
          delete: { rpc: 'wekan:checklistDelete', fields: {} },
          get: { rpc: 'wekan:checklistGet', fields: {} },
          getAll: { rpc: 'wekan:checklistGetAll', fields: {} },
          getCheckItem: { rpc: 'wekan:checklistItemGet', fields: {} },
          deleteCheckItem: { rpc: 'wekan:checklistItemDelete', fields: {} },
          updateCheckItem: { rpc: 'wekan:checklistItemUpdate', fields: {} },
        },
      },
      checklistItem: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'wekan:checklistItemGet', fields: {} },
          delete: { rpc: 'wekan:checklistItemDelete', fields: {} },
          update: { rpc: 'wekan:checklistItemUpdate', fields: {} },
        },
      },
      list: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'wekan:listCreate', fields: {} },
          delete: { rpc: 'wekan:listDelete', fields: {} },
          get: { rpc: 'wekan:listGet', fields: {} },
          getAll: { rpc: 'wekan:listGetAll', fields: {} },
        },
      },
    },
  },
  wise: {
    defaultResource: 'account',
    resources: {
      account: {
        defaultOperation: 'getBalances',
        operations: {
          getBalances: { rpc: 'wise:accountGetBalances', fields: {} },
          getCurrencies: { rpc: 'wise:accountGetCurrencies', fields: {} },
          getStatement: { rpc: 'wise:accountGetStatement', fields: {} },
        },
      },
      exchangeRate: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'wise:exchangeRateGet', fields: {} },
        },
      },
      profile: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'wise:profileGet', fields: {} },
          getAll: { rpc: 'wise:profileGetAll', fields: {} },
        },
      },
      quote: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'wise:quoteGet', fields: {} },
          create: { rpc: 'wise:quoteCreate', fields: {} },
        },
      },
      recipient: {
        defaultOperation: 'getAll',
        operations: {
          getAll: { rpc: 'wise:recipientGetAll', fields: {} },
        },
      },
      transfer: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'wise:transferGet', fields: {} },
          create: { rpc: 'wise:transferCreate', fields: {} },
          delete: { rpc: 'wise:transferDelete', fields: {} },
          execute: { rpc: 'wise:transferExecute', fields: {} },
          getAll: { rpc: 'wise:transferGetAll', fields: {} },
        },
      },
    },
  },
  googlefirebasecloudfirestore: {
    defaultResource: 'document',
    resources: {
      document: {
        defaultOperation: 'get',
        operations: {
          get: {
            rpc: 'google-firebase-cloud-firestore:documentGet',
            fields: {},
          },
          create: {
            rpc: 'google-firebase-cloud-firestore:documentCreate',
            fields: {},
          },
          getAll: {
            rpc: 'google-firebase-cloud-firestore:documentGetAll',
            fields: {},
          },
          delete: {
            rpc: 'google-firebase-cloud-firestore:documentDelete',
            fields: {},
          },
          upsert: {
            rpc: 'google-firebase-cloud-firestore:documentUpsert',
            fields: {},
          },
          query: {
            rpc: 'google-firebase-cloud-firestore:documentQuery',
            fields: {},
          },
        },
      },
      collection: {
        defaultOperation: 'getAll',
        operations: {
          getAll: {
            rpc: 'google-firebase-cloud-firestore:collectionGetAll',
            fields: {},
          },
        },
      },
    },
  },
  mailjet: {
    defaultResource: 'email',
    resources: {
      email: {
        defaultOperation: 'send',
        operations: {
          send: { rpc: 'mailjet:emailSend', fields: {} },
          sendTemplate: { rpc: 'mailjet:emailSendTemplate', fields: {} },
        },
      },
      sms: {
        defaultOperation: 'send',
        operations: {
          send: { rpc: 'mailjet:smsSend', fields: {} },
        },
      },
    },
  },
  tapfiliate: {
    defaultResource: 'affiliate',
    resources: {
      affiliate: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'tapfiliate:affiliateCreate', fields: {} },
          delete: { rpc: 'tapfiliate:affiliateDelete', fields: {} },
          get: { rpc: 'tapfiliate:affiliateGet', fields: {} },
          getAll: { rpc: 'tapfiliate:affiliateGetAll', fields: {} },
        },
      },
      affiliateMetadata: {
        defaultOperation: 'add',
        operations: {
          add: { rpc: 'tapfiliate:affiliateMetadataAdd', fields: {} },
          remove: { rpc: 'tapfiliate:affiliateMetadataRemove', fields: {} },
          update: { rpc: 'tapfiliate:affiliateMetadataUpdate', fields: {} },
        },
      },
      programAffiliate: {
        defaultOperation: 'add',
        operations: {
          add: { rpc: 'tapfiliate:programAffiliateAdd', fields: {} },
          approve: { rpc: 'tapfiliate:programAffiliateApprove', fields: {} },
          disapprove: {
            rpc: 'tapfiliate:programAffiliateDisapprove',
            fields: {},
          },
          get: { rpc: 'tapfiliate:programAffiliateGet', fields: {} },
          getAll: { rpc: 'tapfiliate:programAffiliateGetAll', fields: {} },
        },
      },
    },
  },
  convertkit: {
    defaultResource: 'customField',
    resources: {
      customField: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'convertkit:customFieldCreate', fields: {} },
          delete: { rpc: 'convertkit:customFieldDelete', fields: {} },
          get: { rpc: 'convertkit:customFieldGet', fields: {} },
          getAll: { rpc: 'convertkit:customFieldGetAll', fields: {} },
          update: { rpc: 'convertkit:customFieldUpdate', fields: {} },
        },
      },
      form: {
        defaultOperation: 'addSubscriber',
        operations: {
          addSubscriber: { rpc: 'convertkit:formAddSubscriber', fields: {} },
          getAll: { rpc: 'convertkit:formGetAll', fields: {} },
          getSubscriptions: {
            rpc: 'convertkit:formGetSubscriptions',
            fields: {},
          },
        },
      },
      sequence: {
        defaultOperation: 'addSubscriber',
        operations: {
          addSubscriber: {
            rpc: 'convertkit:sequenceAddSubscriber',
            fields: {},
          },
          getAll: { rpc: 'convertkit:sequenceGetAll', fields: {} },
          getSubscriptions: {
            rpc: 'convertkit:sequenceGetSubscriptions',
            fields: {},
          },
        },
      },
      tag: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'convertkit:tagCreate', fields: {} },
          getAll: { rpc: 'convertkit:tagGetAll', fields: {} },
          subscriberAdd: { rpc: 'convertkit:tagSubscriberAdd', fields: {} },
          subscriberDelete: {
            rpc: 'convertkit:tagSubscriberDelete',
            fields: {},
          },
          subscriberGetAll: {
            rpc: 'convertkit:tagSubscriberGetAll',
            fields: {},
          },
        },
      },
    },
  },
  discourse: {
    defaultResource: 'category',
    resources: {
      category: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'discourse:categoryCreate', fields: {} },
          getAll: { rpc: 'discourse:categoryGetAll', fields: {} },
          update: { rpc: 'discourse:categoryUpdate', fields: {} },
        },
      },
      group: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'discourse:groupCreate', fields: {} },
          get: { rpc: 'discourse:groupGet', fields: {} },
          getAll: { rpc: 'discourse:groupGetAll', fields: {} },
          update: { rpc: 'discourse:groupUpdate', fields: {} },
        },
      },
      post: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'discourse:postCreate', fields: {} },
          get: { rpc: 'discourse:postGet', fields: {} },
          getAll: { rpc: 'discourse:postGetAll', fields: {} },
          update: { rpc: 'discourse:postUpdate', fields: {} },
        },
      },
      user: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'discourse:userCreate', fields: {} },
          get: { rpc: 'discourse:userGet', fields: {} },
          getAll: { rpc: 'discourse:userGetAll', fields: {} },
          groupAdd: { rpc: 'discourse:userGroupAdd', fields: {} },
          groupRemove: { rpc: 'discourse:userGroupRemove', fields: {} },
        },
      },
    },
  },
  egoi: {
    defaultResource: 'contact',
    resources: {
      contact: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'egoi:contactCreate', fields: {} },
          get: { rpc: 'egoi:contactGet', fields: {} },
          getAll: { rpc: 'egoi:contactGetAll', fields: {} },
          update: { rpc: 'egoi:contactUpdate', fields: {} },
        },
      },
    },
  },
  iterable: {
    defaultResource: 'event',
    resources: {
      event: {
        defaultOperation: 'track',
        operations: {
          track: { rpc: 'iterable:eventTrack', fields: {} },
        },
      },
      user: {
        defaultOperation: 'delete',
        operations: {
          delete: { rpc: 'iterable:userDelete', fields: {} },
          get: { rpc: 'iterable:userGet', fields: {} },
          listAdd: { rpc: 'iterable:userListAdd', fields: {} },
          listRemove: { rpc: 'iterable:userListRemove', fields: {} },
          upsert: { rpc: 'iterable:userUpsert', fields: {} },
        },
      },
    },
  },
  keap: {
    defaultResource: 'company',
    resources: {
      company: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'keap:companyCreate', fields: {} },
          getAll: { rpc: 'keap:companyGetAll', fields: {} },
        },
      },
      contact: {
        defaultOperation: 'delete',
        operations: {
          delete: { rpc: 'keap:contactDelete', fields: {} },
          get: { rpc: 'keap:contactGet', fields: {} },
          getAll: { rpc: 'keap:contactGetAll', fields: {} },
          upsert: { rpc: 'keap:contactUpsert', fields: {} },
        },
      },
      contactTag: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'keap:contactTagCreate', fields: {} },
          delete: { rpc: 'keap:contactTagDelete', fields: {} },
          getAll: { rpc: 'keap:contactTagGetAll', fields: {} },
        },
      },
      email: {
        defaultOperation: 'createRecord',
        operations: {
          createRecord: { rpc: 'keap:emailCreateRecord', fields: {} },
          deleteRecord: { rpc: 'keap:emailDeleteRecord', fields: {} },
          getAll: { rpc: 'keap:emailGetAll', fields: {} },
          send: { rpc: 'keap:emailSend', fields: {} },
        },
      },
      file: {
        defaultOperation: 'delete',
        operations: {
          delete: { rpc: 'keap:fileDelete', fields: {} },
          getAll: { rpc: 'keap:fileGetAll', fields: {} },
          upload: { rpc: 'keap:fileUpload', fields: {} },
        },
      },
      note: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'keap:noteCreate', fields: {} },
          delete: { rpc: 'keap:noteDelete', fields: {} },
          get: { rpc: 'keap:noteGet', fields: {} },
          getAll: { rpc: 'keap:noteGetAll', fields: {} },
          update: { rpc: 'keap:noteUpdate', fields: {} },
        },
      },
      order: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'keap:orderCreate', fields: {} },
          delete: { rpc: 'keap:orderDelete', fields: {} },
          get: { rpc: 'keap:orderGet', fields: {} },
          getAll: { rpc: 'keap:orderGetAll', fields: {} },
        },
      },
      product: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'keap:productCreate', fields: {} },
          delete: { rpc: 'keap:productDelete', fields: {} },
          get: { rpc: 'keap:productGet', fields: {} },
          getAll: { rpc: 'keap:productGetAll', fields: {} },
        },
      },
    },
  },
  mqtt: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'sendMessage',
        operations: {
          sendMessage: { rpc: 'mqtt:sendMessage', fields: {} },
        },
      },
    },
  },
  nasa: {
    defaultResource: 'asteroidNeoBrowse',
    resources: {
      asteroidNeoBrowse: {
        defaultOperation: 'getAll',
        operations: {
          getAll: { rpc: 'nasa:asteroidNeoBrowseGetAll', fields: {} },
        },
      },
      asteroidNeoFeed: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'nasa:asteroidNeoFeedGet', fields: {} },
        },
      },
      asteroidNeoLookup: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'nasa:asteroidNeoLookupGet', fields: {} },
        },
      },
      astronomyPictureOfTheDay: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'nasa:astronomyPictureOfTheDayGet', fields: {} },
        },
      },
      donkiCoronalMassEjection: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'nasa:donkiCoronalMassEjectionGet', fields: {} },
        },
      },
      donkiHighSpeedStream: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'nasa:donkiHighSpeedStreamGet', fields: {} },
        },
      },
      donkiInterplanetaryShock: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'nasa:donkiInterplanetaryShockGet', fields: {} },
        },
      },
      donkiMagnetopauseCrossing: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'nasa:donkiMagnetopauseCrossingGet', fields: {} },
        },
      },
      donkiNotifications: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'nasa:donkiNotificationsGet', fields: {} },
        },
      },
      donkiRadiationBeltEnhancement: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'nasa:donkiRadiationBeltEnhancementGet', fields: {} },
        },
      },
      donkiSolarEnergeticParticle: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'nasa:donkiSolarEnergeticParticleGet', fields: {} },
        },
      },
      donkiSolarFlare: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'nasa:donkiSolarFlareGet', fields: {} },
        },
      },
      donkiWsaEnlilSimulation: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'nasa:donkiWsaEnlilSimulationGet', fields: {} },
        },
      },
      earthAssets: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'nasa:earthAssetsGet', fields: {} },
        },
      },
      earthImagery: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'nasa:earthImageryGet', fields: {} },
        },
      },
    },
  },
  openaiassistant: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'chatComplete',
        operations: {
          chatComplete: { rpc: 'openai:chatComplete', fields: {} },
          textEmbedding: { rpc: 'openai:textEmbedding', fields: {} },
          textModerate: { rpc: 'openai:textModerate', fields: {} },
        },
      },
      image: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'openai:imageCreate', fields: {} },
        },
      },
    },
  },
  pushover: {
    defaultResource: 'message',
    resources: {
      message: {
        defaultOperation: 'push',
        operations: {
          push: { rpc: 'pushover:messagePush', fields: {} },
        },
      },
    },
  },
  quickbase: {
    defaultResource: 'field',
    resources: {
      field: {
        defaultOperation: 'getAll',
        operations: {
          getAll: { rpc: 'quickbase:fieldGetAll', fields: {} },
        },
      },
      file: {
        defaultOperation: 'delete',
        operations: {
          delete: { rpc: 'quickbase:fileDelete', fields: {} },
          download: { rpc: 'quickbase:fileDownload', fields: {} },
        },
      },
      record: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'quickbase:recordCreate', fields: {} },
          delete: { rpc: 'quickbase:recordDelete', fields: {} },
          getAll: { rpc: 'quickbase:recordGetAll', fields: {} },
          update: { rpc: 'quickbase:recordUpdate', fields: {} },
          upsert: { rpc: 'quickbase:recordUpsert', fields: {} },
        },
      },
      report: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'quickbase:reportGet', fields: {} },
          run: { rpc: 'quickbase:reportRun', fields: {} },
        },
      },
    },
  },
  twist: {
    defaultResource: 'channel',
    resources: {
      channel: {
        defaultOperation: 'archive',
        operations: {
          archive: { rpc: 'twist:channelArchive', fields: {} },
          create: { rpc: 'twist:channelCreate', fields: {} },
          delete: { rpc: 'twist:channelDelete', fields: {} },
          get: { rpc: 'twist:channelGet', fields: {} },
          getAll: { rpc: 'twist:channelGetAll', fields: {} },
          unarchive: { rpc: 'twist:channelUnarchive', fields: {} },
          update: { rpc: 'twist:channelUpdate', fields: {} },
        },
      },
      comment: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'twist:commentCreate', fields: {} },
          delete: { rpc: 'twist:commentDelete', fields: {} },
          get: { rpc: 'twist:commentGet', fields: {} },
          getAll: { rpc: 'twist:commentGetAll', fields: {} },
          update: { rpc: 'twist:commentUpdate', fields: {} },
        },
      },
      message: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'twist:messageCreate', fields: {} },
          delete: { rpc: 'twist:messageDelete', fields: {} },
          get: { rpc: 'twist:messageGet', fields: {} },
          getAll: { rpc: 'twist:messageGetAll', fields: {} },
          update: { rpc: 'twist:messageUpdate', fields: {} },
        },
      },
      thread: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'twist:threadCreate', fields: {} },
          delete: { rpc: 'twist:threadDelete', fields: {} },
          get: { rpc: 'twist:threadGet', fields: {} },
          getAll: { rpc: 'twist:threadGetAll', fields: {} },
          update: { rpc: 'twist:threadUpdate', fields: {} },
        },
      },
    },
  },
  thehiveproject: {
    defaultResource: 'alert',
    resources: {
      alert: {
        defaultOperation: 'count',
        operations: {
          count: { rpc: 'the-hive:alertCount', fields: {} },
          create: { rpc: 'the-hive:alertCreate', fields: {} },
          executeResponder: {
            rpc: 'the-hive:alertExecuteResponder',
            fields: {},
          },
          get: { rpc: 'the-hive:alertGet', fields: {} },
          getAll: { rpc: 'the-hive:alertGetAll', fields: {} },
          markAsRead: { rpc: 'the-hive:alertMarkAsRead', fields: {} },
          markAsUnread: { rpc: 'the-hive:alertMarkAsUnread', fields: {} },
          merge: { rpc: 'the-hive:alertMerge', fields: {} },
          promote: { rpc: 'the-hive:alertPromote', fields: {} },
          update: { rpc: 'the-hive:alertUpdate', fields: {} },
        },
      },
      case: {
        defaultOperation: 'count',
        operations: {
          count: { rpc: 'the-hive:caseCount', fields: {} },
          create: { rpc: 'the-hive:caseCreate', fields: {} },
          executeResponder: {
            rpc: 'the-hive:caseExecuteResponder',
            fields: {},
          },
          get: { rpc: 'the-hive:caseGet', fields: {} },
          getAll: { rpc: 'the-hive:caseGetAll', fields: {} },
          update: { rpc: 'the-hive:caseUpdate', fields: {} },
        },
      },
      log: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'the-hive:logCreate', fields: {} },
          executeResponder: { rpc: 'the-hive:logExecuteResponder', fields: {} },
          get: { rpc: 'the-hive:logGet', fields: {} },
          getAll: { rpc: 'the-hive:logGetAll', fields: {} },
        },
      },
      observable: {
        defaultOperation: 'count',
        operations: {
          count: { rpc: 'the-hive:observableCount', fields: {} },
          create: { rpc: 'the-hive:observableCreate', fields: {} },
          executeAnalyzer: {
            rpc: 'the-hive:observableExecuteAnalyzer',
            fields: {},
          },
          executeResponder: {
            rpc: 'the-hive:observableExecuteResponder',
            fields: {},
          },
          get: { rpc: 'the-hive:observableGet', fields: {} },
          getAll: { rpc: 'the-hive:observableGetAll', fields: {} },
          search: { rpc: 'the-hive:observableSearch', fields: {} },
          update: { rpc: 'the-hive:observableUpdate', fields: {} },
        },
      },
      task: {
        defaultOperation: 'count',
        operations: {
          count: { rpc: 'the-hive:taskCount', fields: {} },
          create: { rpc: 'the-hive:taskCreate', fields: {} },
          executeResponder: {
            rpc: 'the-hive:taskExecuteResponder',
            fields: {},
          },
          get: { rpc: 'the-hive:taskGet', fields: {} },
          getAll: { rpc: 'the-hive:taskGetAll', fields: {} },
          search: { rpc: 'the-hive:taskSearch', fields: {} },
          update: { rpc: 'the-hive:taskUpdate', fields: {} },
        },
      },
    },
  },
  amqp: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'sendMessage',
        operations: {
          sendMessage: { rpc: 'amqp:sendMessage', fields: {} },
        },
      },
    },
  },
  awscomprehend: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'detectDominantLanguage',
        operations: {
          detectDominantLanguage: {
            rpc: 'aws-comprehend:detectDominantLanguage',
            fields: {},
          },
          detectEntities: { rpc: 'aws-comprehend:detectEntities', fields: {} },
          detectSentiment: {
            rpc: 'aws-comprehend:detectSentiment',
            fields: {},
          },
        },
      },
    },
  },
  dhl: {
    defaultResource: 'shipment',
    resources: {
      shipment: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'dhl:shipmentGet', fields: {} },
        },
      },
    },
  },
  freshdesk: {
    defaultResource: 'contact',
    resources: {
      contact: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'freshdesk:contactCreate', fields: {} },
          delete: { rpc: 'freshdesk:contactDelete', fields: {} },
          get: { rpc: 'freshdesk:contactGet', fields: {} },
          getAll: { rpc: 'freshdesk:contactGetAll', fields: {} },
          update: { rpc: 'freshdesk:contactUpdate', fields: {} },
        },
      },
      ticket: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'freshdesk:ticketCreate', fields: {} },
          delete: { rpc: 'freshdesk:ticketDelete', fields: {} },
          get: { rpc: 'freshdesk:ticketGet', fields: {} },
          getAll: { rpc: 'freshdesk:ticketGetAll', fields: {} },
          update: { rpc: 'freshdesk:ticketUpdate', fields: {} },
        },
      },
    },
  },
  googlebigquery: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'executeQuery',
        operations: {
          executeQuery: { rpc: 'google-big-query:executeQuery', fields: {} },
          insert: { rpc: 'google-big-query:insert', fields: {} },
        },
      },
    },
  },
  googlebooks: {
    defaultResource: 'bookshelf',
    resources: {
      bookshelf: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'google-books:bookshelfGet', fields: {} },
          getAll: { rpc: 'google-books:bookshelfGetAll', fields: {} },
        },
      },
      bookshelfVolume: {
        defaultOperation: 'add',
        operations: {
          add: { rpc: 'google-books:bookshelfVolumeAdd', fields: {} },
          getAll: { rpc: 'google-books:bookshelfVolumeGetAll', fields: {} },
          move: { rpc: 'google-books:bookshelfVolumeMove', fields: {} },
          remove: { rpc: 'google-books:bookshelfVolumeRemove', fields: {} },
        },
      },
      default: {
        defaultOperation: 'bookshelfVolumeClear',
        operations: {
          bookshelfVolumeClear: {
            rpc: 'google-books:bookshelfVolumeClear',
            fields: {},
          },
        },
      },
      volume: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'google-books:volumeGet', fields: {} },
          getAll: { rpc: 'google-books:volumeGetAll', fields: {} },
        },
      },
    },
  },
  gotify: {
    defaultResource: 'message',
    resources: {
      message: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'gotify:messageCreate', fields: {} },
          delete: { rpc: 'gotify:messageDelete', fields: {} },
          getAll: { rpc: 'gotify:messageGetAll', fields: {} },
        },
      },
    },
  },
  grist: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: '_delete',
        operations: {
          _delete: { rpc: 'grist:_delete', fields: {} },
          create: { rpc: 'grist:create', fields: {} },
          getAll: { rpc: 'grist:getAll', fields: {} },
          update: { rpc: 'grist:update', fields: {} },
        },
      },
    },
  },
  harvest: {
    defaultResource: 'client',
    resources: {
      client: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'harvest:clientCreate', fields: {} },
          delete: { rpc: 'harvest:clientDelete', fields: {} },
          get: { rpc: 'harvest:clientGet', fields: {} },
          getAll: { rpc: 'harvest:clientGetAll', fields: {} },
          update: { rpc: 'harvest:clientUpdate', fields: {} },
        },
      },
      company: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'harvest:companyGet', fields: {} },
        },
      },
      contact: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'harvest:contactCreate', fields: {} },
          delete: { rpc: 'harvest:contactDelete', fields: {} },
          get: { rpc: 'harvest:contactGet', fields: {} },
          getAll: { rpc: 'harvest:contactGetAll', fields: {} },
          update: { rpc: 'harvest:contactUpdate', fields: {} },
        },
      },
      estimate: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'harvest:estimateCreate', fields: {} },
          delete: { rpc: 'harvest:estimateDelete', fields: {} },
          get: { rpc: 'harvest:estimateGet', fields: {} },
          getAll: { rpc: 'harvest:estimateGetAll', fields: {} },
          update: { rpc: 'harvest:estimateUpdate', fields: {} },
        },
      },
      expense: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'harvest:expenseCreate', fields: {} },
          delete: { rpc: 'harvest:expenseDelete', fields: {} },
          get: { rpc: 'harvest:expenseGet', fields: {} },
          getAll: { rpc: 'harvest:expenseGetAll', fields: {} },
          update: { rpc: 'harvest:expenseUpdate', fields: {} },
        },
      },
      invoice: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'harvest:invoiceCreate', fields: {} },
          delete: { rpc: 'harvest:invoiceDelete', fields: {} },
          get: { rpc: 'harvest:invoiceGet', fields: {} },
          getAll: { rpc: 'harvest:invoiceGetAll', fields: {} },
          update: { rpc: 'harvest:invoiceUpdate', fields: {} },
        },
      },
      project: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'harvest:projectCreate', fields: {} },
          delete: { rpc: 'harvest:projectDelete', fields: {} },
          get: { rpc: 'harvest:projectGet', fields: {} },
          getAll: { rpc: 'harvest:projectGetAll', fields: {} },
          update: { rpc: 'harvest:projectUpdate', fields: {} },
        },
      },
      task: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'harvest:taskCreate', fields: {} },
          delete: { rpc: 'harvest:taskDelete', fields: {} },
          get: { rpc: 'harvest:taskGet', fields: {} },
          getAll: { rpc: 'harvest:taskGetAll', fields: {} },
          update: { rpc: 'harvest:taskUpdate', fields: {} },
        },
      },
      default: {
        defaultOperation: 'timeEntryCreateByDuration',
        operations: {
          timeEntryCreateByDuration: {
            rpc: 'harvest:timeEntryCreateByDuration',
            fields: {},
          },
          timeEntryCreateByStartEnd: {
            rpc: 'harvest:timeEntryCreateByStartEnd',
            fields: {},
          },
          timeEntryDeleteExternal: {
            rpc: 'harvest:timeEntryDeleteExternal',
            fields: {},
          },
          timeEntryRestartTime: {
            rpc: 'harvest:timeEntryRestartTime',
            fields: {},
          },
          timeEntryStopTime: { rpc: 'harvest:timeEntryStopTime', fields: {} },
          userMe: { rpc: 'harvest:userMe', fields: {} },
        },
      },
      timeEntry: {
        defaultOperation: 'delete',
        operations: {
          delete: { rpc: 'harvest:timeEntryDelete', fields: {} },
          get: { rpc: 'harvest:timeEntryGet', fields: {} },
          getAll: { rpc: 'harvest:timeEntryGetAll', fields: {} },
          update: { rpc: 'harvest:timeEntryUpdate', fields: {} },
        },
      },
      user: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'harvest:userCreate', fields: {} },
          delete: { rpc: 'harvest:userDelete', fields: {} },
          get: { rpc: 'harvest:userGet', fields: {} },
          getAll: { rpc: 'harvest:userGetAll', fields: {} },
          update: { rpc: 'harvest:userUpdate', fields: {} },
        },
      },
    },
  },
  onfleet: {
    defaultResource: 'admin',
    resources: {
      admin: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'onfleet:adminCreate', fields: {} },
          delete: { rpc: 'onfleet:adminDelete', fields: {} },
          getAll: { rpc: 'onfleet:adminGetAll', fields: {} },
          update: { rpc: 'onfleet:adminUpdate', fields: {} },
        },
      },
      default: {
        defaultOperation: 'containerAddTask',
        operations: {
          containerAddTask: { rpc: 'onfleet:containerAddTask', fields: {} },
          containerUpdateTask: {
            rpc: 'onfleet:containerUpdateTask',
            fields: {},
          },
          organizationGetDelegatee: {
            rpc: 'onfleet:organizationGetDelegatee',
            fields: {},
          },
          taskClone: { rpc: 'onfleet:taskClone', fields: {} },
          taskComplete: { rpc: 'onfleet:taskComplete', fields: {} },
          teamAutoDispatch: { rpc: 'onfleet:teamAutoDispatch', fields: {} },
          teamGetTimeEstimates: {
            rpc: 'onfleet:teamGetTimeEstimates',
            fields: {},
          },
          workerGetSchedule: { rpc: 'onfleet:workerGetSchedule', fields: {} },
        },
      },
      container: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'onfleet:containerGet', fields: {} },
        },
      },
      destination: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'onfleet:destinationCreate', fields: {} },
          get: { rpc: 'onfleet:destinationGet', fields: {} },
        },
      },
      hub: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'onfleet:hubCreate', fields: {} },
          getAll: { rpc: 'onfleet:hubGetAll', fields: {} },
          update: { rpc: 'onfleet:hubUpdate', fields: {} },
        },
      },
      organization: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'onfleet:organizationGet', fields: {} },
        },
      },
      recipient: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'onfleet:recipientCreate', fields: {} },
          get: { rpc: 'onfleet:recipientGet', fields: {} },
          update: { rpc: 'onfleet:recipientUpdate', fields: {} },
        },
      },
      task: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'onfleet:taskCreate', fields: {} },
          delete: { rpc: 'onfleet:taskDelete', fields: {} },
          get: { rpc: 'onfleet:taskGet', fields: {} },
          getAll: { rpc: 'onfleet:taskGetAll', fields: {} },
          update: { rpc: 'onfleet:taskUpdate', fields: {} },
        },
      },
      team: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'onfleet:teamCreate', fields: {} },
          delete: { rpc: 'onfleet:teamDelete', fields: {} },
          get: { rpc: 'onfleet:teamGet', fields: {} },
          getAll: { rpc: 'onfleet:teamGetAll', fields: {} },
          update: { rpc: 'onfleet:teamUpdate', fields: {} },
        },
      },
      worker: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'onfleet:workerCreate', fields: {} },
          delete: { rpc: 'onfleet:workerDelete', fields: {} },
          get: { rpc: 'onfleet:workerGet', fields: {} },
          getAll: { rpc: 'onfleet:workerGetAll', fields: {} },
          update: { rpc: 'onfleet:workerUpdate', fields: {} },
        },
      },
    },
  },
  rocketchat: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'chatPostMessage',
        operations: {
          chatPostMessage: { rpc: 'rocketchat:chatPostMessage', fields: {} },
          dmMessages: { rpc: 'rocketchat:dmMessages', fields: {} },
          subscriptionsRead: {
            rpc: 'rocketchat:subscriptionsRead',
            fields: {},
          },
        },
      },
      subscriptions: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'rocketchat:subscriptionsGet', fields: {} },
        },
      },
    },
  },
  securityscorecard: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'companyGetFactor',
        operations: {
          companyGetFactor: {
            rpc: 'security-scorecard:companyGetFactor',
            fields: {},
          },
          companyGetFactorHistorical: {
            rpc: 'security-scorecard:companyGetFactorHistorical',
            fields: {},
          },
          companyGetHistoricalScore: {
            rpc: 'security-scorecard:companyGetHistoricalScore',
            fields: {},
          },
          companyGetScorePlan: {
            rpc: 'security-scorecard:companyGetScorePlan',
            fields: {},
          },
          companyGetScorecard: {
            rpc: 'security-scorecard:companyGetScorecard',
            fields: {},
          },
          industryGetFactor: {
            rpc: 'security-scorecard:industryGetFactor',
            fields: {},
          },
          industryGetFactorHistorical: {
            rpc: 'security-scorecard:industryGetFactorHistorical',
            fields: {},
          },
          industryGetScore: {
            rpc: 'security-scorecard:industryGetScore',
            fields: {},
          },
          reportGenerate: {
            rpc: 'security-scorecard:reportGenerate',
            fields: {},
          },
        },
      },
      invite: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'security-scorecard:inviteCreate', fields: {} },
        },
      },
      portfolioCompany: {
        defaultOperation: 'add',
        operations: {
          add: { rpc: 'security-scorecard:portfolioCompanyAdd', fields: {} },
          getAll: {
            rpc: 'security-scorecard:portfolioCompanyGetAll',
            fields: {},
          },
          remove: {
            rpc: 'security-scorecard:portfolioCompanyRemove',
            fields: {},
          },
        },
      },
      portfolio: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'security-scorecard:portfolioCreate', fields: {} },
          delete: { rpc: 'security-scorecard:portfolioDelete', fields: {} },
          getAll: { rpc: 'security-scorecard:portfolioGetAll', fields: {} },
          update: { rpc: 'security-scorecard:portfolioUpdate', fields: {} },
        },
      },
      report: {
        defaultOperation: 'download',
        operations: {
          download: { rpc: 'security-scorecard:reportDownload', fields: {} },
          getAll: { rpc: 'security-scorecard:reportGetAll', fields: {} },
        },
      },
    },
  },
  sendy: {
    defaultResource: 'campaign',
    resources: {
      campaign: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'sendy:campaignCreate', fields: {} },
        },
      },
      subscriber: {
        defaultOperation: 'add',
        operations: {
          add: { rpc: 'sendy:subscriberAdd', fields: {} },
          count: { rpc: 'sendy:subscriberCount', fields: {} },
          delete: { rpc: 'sendy:subscriberDelete', fields: {} },
          remove: { rpc: 'sendy:subscriberRemove', fields: {} },
        },
      },
      default: {
        defaultOperation: 'subscriberStatus',
        operations: {
          subscriberStatus: { rpc: 'sendy:subscriberStatus', fields: {} },
        },
      },
    },
  },
  storyblok: {
    defaultResource: 'story',
    resources: {
      story: {
        defaultOperation: 'delete',
        operations: {
          delete: { rpc: 'storyblok:storyDelete', fields: {} },
          get: { rpc: 'storyblok:storyGet', fields: {} },
          getAll: { rpc: 'storyblok:storyGetAll', fields: {} },
        },
      },
      default: {
        defaultOperation: 'storyPublish',
        operations: {
          storyPublish: { rpc: 'storyblok:storyPublish', fields: {} },
          storyUnpublish: { rpc: 'storyblok:storyUnpublish', fields: {} },
        },
      },
    },
  },
  taiga: {
    defaultResource: 'epic',
    resources: {
      epic: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'taiga:epicCreate', fields: {} },
          delete: { rpc: 'taiga:epicDelete', fields: {} },
          get: { rpc: 'taiga:epicGet', fields: {} },
          getAll: { rpc: 'taiga:epicGetAll', fields: {} },
          update: { rpc: 'taiga:epicUpdate', fields: {} },
        },
      },
      issue: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'taiga:issueCreate', fields: {} },
          delete: { rpc: 'taiga:issueDelete', fields: {} },
          get: { rpc: 'taiga:issueGet', fields: {} },
          getAll: { rpc: 'taiga:issueGetAll', fields: {} },
          update: { rpc: 'taiga:issueUpdate', fields: {} },
        },
      },
      task: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'taiga:taskCreate', fields: {} },
          delete: { rpc: 'taiga:taskDelete', fields: {} },
          get: { rpc: 'taiga:taskGet', fields: {} },
          getAll: { rpc: 'taiga:taskGetAll', fields: {} },
          update: { rpc: 'taiga:taskUpdate', fields: {} },
        },
      },
      userStory: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'taiga:userStoryCreate', fields: {} },
          delete: { rpc: 'taiga:userStoryDelete', fields: {} },
          get: { rpc: 'taiga:userStoryGet', fields: {} },
          getAll: { rpc: 'taiga:userStoryGetAll', fields: {} },
          update: { rpc: 'taiga:userStoryUpdate', fields: {} },
        },
      },
    },
  },
  zulip: {
    defaultResource: 'message',
    resources: {
      message: {
        defaultOperation: 'delete',
        operations: {
          delete: { rpc: 'zulip:messageDelete', fields: {} },
          get: { rpc: 'zulip:messageGet', fields: {} },
          update: { rpc: 'zulip:messageUpdate', fields: {} },
        },
      },
      default: {
        defaultOperation: 'messageSendPrivate',
        operations: {
          messageSendPrivate: { rpc: 'zulip:messageSendPrivate', fields: {} },
          messageSendStream: { rpc: 'zulip:messageSendStream', fields: {} },
          messageUploadFile: { rpc: 'zulip:messageUploadFile', fields: {} },
          streamGetSubscribed: { rpc: 'zulip:streamGetSubscribed', fields: {} },
          userDeactivate: { rpc: 'zulip:userDeactivate', fields: {} },
        },
      },
      stream: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'zulip:streamCreate', fields: {} },
          delete: { rpc: 'zulip:streamDelete', fields: {} },
          getAll: { rpc: 'zulip:streamGetAll', fields: {} },
          update: { rpc: 'zulip:streamUpdate', fields: {} },
        },
      },
      user: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'zulip:userCreate', fields: {} },
          get: { rpc: 'zulip:userGet', fields: {} },
          getAll: { rpc: 'zulip:userGetAll', fields: {} },
          update: { rpc: 'zulip:userUpdate', fields: {} },
        },
      },
    },
  },
  gsuiteadmin: {
    defaultResource: 'group',
    resources: {
      group: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'g-suite-admin:groupCreate', fields: {} },
          delete: { rpc: 'g-suite-admin:groupDelete', fields: {} },
          get: { rpc: 'g-suite-admin:groupGet', fields: {} },
          getAll: { rpc: 'g-suite-admin:groupGetAll', fields: {} },
          update: { rpc: 'g-suite-admin:groupUpdate', fields: {} },
        },
      },
      user: {
        defaultOperation: 'addToGroup',
        operations: {
          addToGroup: { rpc: 'g-suite-admin:userAddToGroup', fields: {} },
          create: { rpc: 'g-suite-admin:userCreate', fields: {} },
          delete: { rpc: 'g-suite-admin:userDelete', fields: {} },
          get: { rpc: 'g-suite-admin:userGet', fields: {} },
          getAll: { rpc: 'g-suite-admin:userGetAll', fields: {} },
          removeFromGroup: {
            rpc: 'g-suite-admin:userRemoveFromGroup',
            fields: {},
          },
          update: { rpc: 'g-suite-admin:userUpdate', fields: {} },
        },
      },
    },
  },
  mailcheck: {
    defaultResource: 'email',
    resources: {
      email: {
        defaultOperation: 'check',
        operations: {
          check: { rpc: 'mailcheck:emailCheck', fields: {} },
        },
      },
    },
  },
  msg91: {
    defaultResource: 'sms',
    resources: {
      sms: {
        defaultOperation: 'send',
        operations: {
          send: { rpc: 'msg91:smsSend', fields: {} },
        },
      },
    },
  },
  peekalink: {
    defaultResource: 'preview',
    resources: {
      preview: {
        defaultOperation: 'isAvailable',
        operations: {
          isAvailable: { rpc: 'peekalink:isAvailable', fields: {} },
          preview: { rpc: 'peekalink:preview', fields: {} },
        },
      },
    },
  },
  pushbullet: {
    defaultResource: 'push',
    resources: {
      push: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'pushbullet:pushCreate', fields: {} },
          delete: { rpc: 'pushbullet:pushDelete', fields: {} },
          getAll: { rpc: 'pushbullet:pushGetAll', fields: {} },
          update: { rpc: 'pushbullet:pushUpdate', fields: {} },
        },
      },
    },
  },
  totp: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'generateSecret',
        operations: {
          generateSecret: { rpc: 'totp:totpGenerate', fields: {} },
        },
      },
    },
  },
  vero: {
    defaultResource: 'user',
    resources: {
      user: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'vero:userCreate', fields: {} },
          delete: { rpc: 'vero:userDelete', fields: {} },
          addTags: { rpc: 'vero:userAddTags', fields: {} },
          unsubscribe: { rpc: 'vero:userUnsubscribe', fields: {} },
          resubscribe: { rpc: 'vero:userResubscribe', fields: {} },
          alias: { rpc: 'vero:userAlias', fields: {} },
        },
      },
      event: {
        defaultOperation: 'track',
        operations: {
          track: { rpc: 'vero:eventTrack', fields: {} },
        },
      },
    },
  },
  yourls: {
    defaultResource: 'url',
    resources: {
      url: {
        defaultOperation: 'shorten',
        operations: {
          shorten: { rpc: 'yourls:urlShorten', fields: {} },
          expand: { rpc: 'yourls:urlExpand', fields: {} },
          stats: { rpc: 'yourls:urlStats', fields: {} },
        },
      },
    },
  },
  awslambda: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'invoke',
        operations: {
          invoke: { rpc: 'aws-lambda:invoke', fields: {} },
        },
      },
    },
  },
  awssns: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'publish',
        operations: {
          publish: { rpc: 'aws-sns:publish', fields: {} },
        },
      },
    },
  },
  awssqs: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'sendMessage',
        operations: {
          sendMessage: { rpc: 'aws-sqs:sendMessage', fields: {} },
        },
      },
    },
  },
  bitly: {
    defaultResource: 'link',
    resources: {
      link: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'bitly:linkCreate', fields: {} },
          get: { rpc: 'bitly:linkGet', fields: {} },
          update: { rpc: 'bitly:linkUpdate', fields: {} },
        },
      },
    },
  },
  googlefirebaserealtimedatabase: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'create',
        operations: {
          create: {
            rpc: 'google-firebase-realtime-database:create',
            fields: {},
          },
          get: { rpc: 'google-firebase-realtime-database:get', fields: {} },
          update: {
            rpc: 'google-firebase-realtime-database:update',
            fields: {},
          },
          delete: {
            rpc: 'google-firebase-realtime-database:deleteRecord',
            fields: {},
          },
          push: { rpc: 'google-firebase-realtime-database:push', fields: {} },
        },
      },
    },
  },
  microsoftsql: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'executeQuery',
        operations: {
          executeQuery: { rpc: 'microsoft-sql:executeQuery', fields: {} },
          insert: { rpc: 'microsoft-sql:insert', fields: {} },
          update: { rpc: 'microsoft-sql:update', fields: {} },
          delete: { rpc: 'microsoft-sql:deleteRows', fields: {} },
        },
      },
    },
  },
  mocean: {
    defaultResource: 'sms',
    resources: {
      sms: {
        defaultOperation: 'send',
        operations: {
          send: { rpc: 'mocean:smsSend', fields: {} },
        },
      },
      voice: {
        defaultOperation: 'send',
        operations: {
          send: { rpc: 'mocean:voiceSend', fields: {} },
        },
      },
    },
  },
  openthesaurus: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'getSynonyms',
        operations: {
          getSynonyms: { rpc: 'open-thesaurus:getSynonyms', fields: {} },
        },
      },
    },
  },
  philipshue: {
    defaultResource: 'light',
    resources: {
      light: {
        defaultOperation: 'getAll',
        operations: {
          getAll: { rpc: 'philips-hue:lightGetAll', fields: {} },
          get: { rpc: 'philips-hue:lightGet', fields: {} },
          update: { rpc: 'philips-hue:lightUpdate', fields: {} },
          delete: { rpc: 'philips-hue:lightDelete', fields: {} },
        },
      },
    },
  },
  questdb: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'executeQuery',
        operations: {
          executeQuery: { rpc: 'quest-db:executeQuery', fields: {} },
          insert: { rpc: 'quest-db:insert', fields: {} },
        },
      },
    },
  },
  rabbitmq: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'sendMessage',
        operations: {
          sendMessage: { rpc: 'rabbitmq:sendMessage', fields: {} },
          deleteMessage: { rpc: 'rabbitmq:deleteMessage', fields: {} },
        },
      },
    },
  },
  timescaledb: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'executeQuery',
        operations: {
          executeQuery: { rpc: 'timescale-db:executeQuery', fields: {} },
          insert: { rpc: 'timescale-db:insert', fields: {} },
          update: { rpc: 'timescale-db:update', fields: {} },
        },
      },
    },
  },
  uplead: {
    defaultResource: 'company',
    resources: {
      company: {
        defaultOperation: 'enrich',
        operations: {
          enrich: { rpc: 'uplead:companyEnrich', fields: {} },
        },
      },
      person: {
        defaultOperation: 'enrich',
        operations: {
          enrich: { rpc: 'uplead:personEnrich', fields: {} },
        },
      },
    },
  },
  urlscanio: {
    defaultResource: 'scan',
    resources: {
      scan: {
        defaultOperation: 'perform',
        operations: {
          perform: { rpc: 'url-scan-io:scanPerform', fields: {} },
          get: { rpc: 'url-scan-io:scanGet', fields: {} },
          getAll: { rpc: 'url-scan-io:scanGetAll', fields: {} },
        },
      },
    },
  },
  gmailtool: {
    defaultResource: 'message',
    resources: {
      message: {
        defaultOperation: 'send',
        operations: {
          send: {
            // NOTE: the addon's `to` is a structured `[{ email, name? }]` array;
            // n8n's `sendTo` is a comma-separated string. Shape conversion is
            // addon-map-step territory, so recipients aren't mapped here.
            rpc: 'gmail:messageSend',
            fields: {
              subject: { from: 'subject' },
              body: { from: 'message' },
            },
          },
          reply: {
            rpc: 'gmail:messageReply',
            fields: {
              messageId: { from: 'messageId' },
              body: { from: 'message' },
            },
          },
          get: {
            rpc: 'gmail:messageGet',
            fields: { id: { from: 'messageId' } },
          },
          getAll: { rpc: 'gmail:messageList', fields: {} },
          delete: {
            rpc: 'gmail:messageDelete',
            fields: { id: { from: 'messageId' } },
          },
          markAsRead: {
            rpc: 'gmail:messageMarkRead',
            fields: { id: { from: 'messageId' } },
          },
          markAsUnread: {
            rpc: 'gmail:messageMarkUnread',
            fields: { id: { from: 'messageId' } },
          },
          addLabels: {
            rpc: 'gmail:messageAddLabel',
            fields: { id: { from: 'messageId' } },
          },
          removeLabels: {
            rpc: 'gmail:messageRemoveLabel',
            fields: { id: { from: 'messageId' } },
          },
        },
      },
      label: {
        defaultOperation: 'getAll',
        operations: {
          create: {
            rpc: 'gmail:labelCreate',
            fields: { name: { from: 'name' } },
          },
          delete: {
            rpc: 'gmail:labelDelete',
            fields: { id: { from: 'labelId' } },
          },
          get: { rpc: 'gmail:labelGet', fields: { id: { from: 'labelId' } } },
          getAll: { rpc: 'gmail:labelList', fields: {} },
        },
      },
      draft: {
        defaultOperation: 'create',
        operations: {
          create: {
            rpc: 'gmail:draftCreate',
            fields: {
              subject: { from: 'subject' },
              body: { from: 'message' },
            },
          },
          delete: {
            rpc: 'gmail:draftDelete',
            fields: { id: { from: 'messageId' } },
          },
          get: { rpc: 'gmail:draftGet', fields: { id: { from: 'messageId' } } },
          getAll: { rpc: 'gmail:draftList', fields: {} },
        },
      },
      thread: {
        defaultOperation: 'getAll',
        operations: {
          get: { rpc: 'gmail:threadGet', fields: { id: { from: 'threadId' } } },
          getAll: { rpc: 'gmail:threadList', fields: {} },
          delete: {
            rpc: 'gmail:threadDelete',
            fields: { id: { from: 'threadId' } },
          },
          reply: {
            rpc: 'gmail:threadReply',
            fields: {
              threadId: { from: 'threadId' },
              body: { from: 'message' },
            },
          },
          trash: {
            rpc: 'gmail:threadTrash',
            fields: { id: { from: 'threadId' } },
          },
          untrash: {
            rpc: 'gmail:threadUntrash',
            fields: { id: { from: 'threadId' } },
          },
          addLabels: {
            rpc: 'gmail:threadAddLabel',
            fields: { id: { from: 'threadId' } },
          },
          removeLabels: {
            rpc: 'gmail:threadRemoveLabel',
            fields: { id: { from: 'threadId' } },
          },
        },
      },
    },
  },
  googlecalendartool: {
    defaultResource: 'event',
    resources: {
      event: {
        defaultOperation: 'create',
        operations: {
          create: {
            rpc: 'google-calendar:eventsInsert',
            fields: {
              calendarId: { fromRL: 'calendar' },
            },
          },
          getAll: {
            rpc: 'google-calendar:eventsList',
            fields: {
              calendarId: { fromRL: 'calendar' },
            },
          },
          update: {
            rpc: 'google-calendar:eventsUpdate',
            fields: {
              calendarId: { fromRL: 'calendar' },
              eventId: { fromRL: 'eventId' },
            },
          },
          get: {
            rpc: 'google-calendar:eventsGet',
            fields: {
              calendarId: { fromRL: 'calendar' },
              eventId: { fromRL: 'eventId' },
            },
          },
          delete: {
            rpc: 'google-calendar:eventsDelete',
            fields: {
              calendarId: { fromRL: 'calendar' },
              eventId: { fromRL: 'eventId' },
            },
          },
        },
      },
    },
  },
  airtabletool: {
    defaultResource: 'record',
    resources: {
      record: {
        defaultOperation: 'search',
        operations: {
          create: {
            rpc: 'airtable:createRecord',
            fields: {
              baseId: { fromRL: ['base', 'application'] },
              tableId: { fromRL: 'table' },
            },
          },
          append: {
            rpc: 'airtable:createRecord',
            fields: {
              baseId: { fromRL: ['base', 'application'] },
              tableId: { fromRL: 'table' },
            },
          },
          list: {
            rpc: 'airtable:listRecords',
            fields: {
              baseId: { fromRL: ['base', 'application'] },
              tableId: { fromRL: 'table' },
            },
          },
          search: {
            rpc: 'airtable:listRecords',
            fields: {
              baseId: { fromRL: ['base', 'application'] },
              tableId: { fromRL: 'table' },
            },
          },
          read: {
            rpc: 'airtable:getRecord',
            fields: {
              baseId: { fromRL: ['base', 'application'] },
              tableId: { fromRL: 'table' },
              recordId: { fromRL: ['id', 'recordId'] },
            },
          },
          get: {
            rpc: 'airtable:getRecord',
            fields: {
              baseId: { fromRL: ['base', 'application'] },
              tableId: { fromRL: 'table' },
              recordId: { fromRL: ['id', 'recordId'] },
            },
          },
          update: {
            rpc: 'airtable:updateRecord',
            fields: {
              baseId: { fromRL: ['base', 'application'] },
              tableId: { fromRL: 'table' },
              recordId: { fromRL: ['id', 'recordId'] },
            },
          },
          deleteRecord: {
            rpc: 'airtable:deleteRecord',
            fields: {
              baseId: { fromRL: ['base', 'application'] },
              tableId: { fromRL: 'table' },
              recordId: { fromRL: ['id', 'recordId'] },
            },
          },
        },
      },
    },
  },
  postgrestool: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'executeQuery',
        operations: {
          executeQuery: {
            rpc: 'postgres:executeQuery',
            fields: { query: { from: 'query' } },
          },
          insert: {
            rpc: 'postgres:insert',
            fields: { table: { fromRL: 'table' } },
          },
          update: {
            rpc: 'postgres:update',
            fields: { table: { fromRL: 'table' } },
          },
          select: {
            rpc: 'postgres:select',
            fields: { table: { fromRL: 'table' } },
          },
          upsert: {
            rpc: 'postgres:upsert',
            fields: { table: { fromRL: 'table' } },
          },
          delete: {
            rpc: 'postgres:deleteRows',
            fields: { table: { fromRL: 'table' } },
          },
        },
      },
    },
  },
  supabasetool: {
    defaultResource: 'row',
    resources: {
      row: {
        defaultOperation: 'getAll',
        operations: {
          create: {
            rpc: 'supabase:insertRows',
            fields: { table: { fromRL: 'tableId' } },
          },
          getAll: {
            rpc: 'supabase:selectRows',
            fields: { table: { fromRL: 'tableId' } },
          },
          get: {
            rpc: 'supabase:selectRows',
            fields: { table: { fromRL: 'tableId' } },
          },
          update: {
            rpc: 'supabase:updateRows',
            fields: { table: { fromRL: 'tableId' } },
          },
          delete: {
            rpc: 'supabase:deleteRows',
            fields: { table: { fromRL: 'tableId' } },
          },
        },
      },
    },
  },
  googlesheetstool: {
    defaultResource: 'sheet',
    resources: {
      sheet: {
        defaultOperation: 'read',
        operations: {
          // NOTE: n8n's `sheetName` resource-locator often carries a `gid=N`
          // value rather than an A1 sheet name; the Sheets API wants A1. The
          // gid→name resolution is an addon-completeness detail (addon-map step).
          append: {
            rpc: 'google-sheets:valuesAppend',
            fields: {
              spreadsheetId: { fromRL: 'documentId' },
              range: { fromRL: 'sheetName' },
            },
          },
          read: {
            rpc: 'google-sheets:valuesGet',
            fields: {
              spreadsheetId: { fromRL: 'documentId' },
              range: { fromRL: 'sheetName' },
            },
          },
          update: {
            rpc: 'google-sheets:valuesUpdate',
            fields: {
              spreadsheetId: { fromRL: 'documentId' },
              range: { fromRL: 'sheetName' },
            },
          },
          appendOrUpdate: {
            rpc: 'google-sheets:valuesUpdate',
            fields: {
              spreadsheetId: { fromRL: 'documentId' },
              range: { fromRL: 'sheetName' },
            },
          },
          clear: {
            rpc: 'google-sheets:valuesClear',
            fields: {
              spreadsheetId: { fromRL: 'documentId' },
              range: { fromRL: 'sheetName' },
            },
          },
        },
      },
      spreadsheet: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'google-sheets:create', fields: {} },
        },
      },
    },
  },
  googledocstool: {
    defaultResource: 'document',
    resources: {
      document: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'google-docs:docsDocumentsCreate', fields: {} },
          get: { rpc: 'google-docs:docsDocumentsGet', fields: {} },
          update: { rpc: 'google-docs:docsDocumentsBatchUpdate', fields: {} },
        },
      },
    },
  },
  discordtool: {
    defaultResource: 'message',
    resources: {
      message: {
        defaultOperation: 'send',
        operations: {
          send: {
            rpc: 'discord:messageSend',
            fields: {
              channel_id: { fromRL: ['channelId', 'channel'] },
              content: { from: 'content' },
            },
          },
        },
      },
    },
  },
  microsoftoutlooktool: {
    defaultResource: 'message',
    resources: {
      message: {
        defaultOperation: 'send',
        operations: {
          send: { rpc: 'microsoft-outlook:userSendMail', fields: {} },
          reply: { rpc: 'microsoft-outlook:userMessageReply', fields: {} },
          get: { rpc: 'microsoft-outlook:userGetMessage', fields: {} },
          getAll: { rpc: 'microsoft-outlook:userListMessage', fields: {} },
          delete: { rpc: 'microsoft-outlook:userDeleteMessage', fields: {} },
          move: { rpc: 'microsoft-outlook:userMessageMove', fields: {} },
          update: { rpc: 'microsoft-outlook:userUpdateMessage', fields: {} },
        },
      },
      draft: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'microsoft-outlook:userCreateMessage', fields: {} },
          get: { rpc: 'microsoft-outlook:userGetMessage', fields: {} },
          send: { rpc: 'microsoft-outlook:userMessageSend', fields: {} },
          update: { rpc: 'microsoft-outlook:userUpdateMessage', fields: {} },
          delete: { rpc: 'microsoft-outlook:userDeleteMessage', fields: {} },
        },
      },
      folder: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'microsoft-outlook:userCreateMailFolder', fields: {} },
          get: { rpc: 'microsoft-outlook:userGetMailFolder', fields: {} },
          getAll: { rpc: 'microsoft-outlook:userListMailFolder', fields: {} },
          delete: { rpc: 'microsoft-outlook:userDeleteMailFolder', fields: {} },
          update: { rpc: 'microsoft-outlook:userUpdateMailFolder', fields: {} },
        },
      },
      folderMessage: {
        defaultOperation: 'getAll',
        operations: {
          getAll: {
            rpc: 'microsoft-outlook:userMailFolderListMessage',
            fields: {},
          },
        },
      },
      event: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'microsoft-outlook:userCreateEvent', fields: {} },
          get: { rpc: 'microsoft-outlook:userGetEvent', fields: {} },
          getAll: { rpc: 'microsoft-outlook:userListEvent', fields: {} },
          delete: { rpc: 'microsoft-outlook:userDeleteEvent', fields: {} },
          update: { rpc: 'microsoft-outlook:userUpdateEvent', fields: {} },
        },
      },
      calendar: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'microsoft-outlook:userCreateCalendar', fields: {} },
          get: { rpc: 'microsoft-outlook:userGetCalendar', fields: {} },
          getAll: { rpc: 'microsoft-outlook:userListCalendar', fields: {} },
          delete: { rpc: 'microsoft-outlook:userDeleteCalendar', fields: {} },
          update: { rpc: 'microsoft-outlook:userUpdateCalendar', fields: {} },
        },
      },
      contact: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'microsoft-outlook:userCreateContact', fields: {} },
          get: { rpc: 'microsoft-outlook:userGetContact', fields: {} },
          getAll: { rpc: 'microsoft-outlook:userListContact', fields: {} },
          delete: { rpc: 'microsoft-outlook:userDeleteContact', fields: {} },
          update: { rpc: 'microsoft-outlook:userUpdateContact', fields: {} },
        },
      },
      messageAttachment: {
        defaultOperation: 'getAll',
        operations: {
          add: {
            rpc: 'microsoft-outlook:userMessageCreateAttachment',
            fields: {},
          },
          get: {
            rpc: 'microsoft-outlook:userMessageGetAttachment',
            fields: {},
          },
          getAll: {
            rpc: 'microsoft-outlook:userMessageListAttachment',
            fields: {},
          },
        },
      },
    },
  },
  googletaskstool: {
    defaultResource: 'task',
    resources: {
      task: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'google-tasks:taskCreate', fields: {} },
          get: { rpc: 'google-tasks:taskGet', fields: {} },
          getAll: { rpc: 'google-tasks:taskGetAll', fields: {} },
          update: { rpc: 'google-tasks:taskUpdate', fields: {} },
          delete: { rpc: 'google-tasks:taskDelete', fields: {} },
        },
      },
    },
  },
  woocommercetool: {
    defaultResource: 'product',
    resources: {
      product: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'woocommerce:productCreate', fields: {} },
          get: { rpc: 'woocommerce:productGet', fields: {} },
          getAll: { rpc: 'woocommerce:productGetAll', fields: {} },
          update: { rpc: 'woocommerce:productUpdate', fields: {} },
          delete: { rpc: 'woocommerce:productDelete', fields: {} },
        },
      },
      order: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'woocommerce:orderCreate', fields: {} },
          get: { rpc: 'woocommerce:orderGet', fields: {} },
          getAll: { rpc: 'woocommerce:orderGetAll', fields: {} },
          update: { rpc: 'woocommerce:orderUpdate', fields: {} },
          delete: { rpc: 'woocommerce:orderDelete', fields: {} },
        },
      },
      customer: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'woocommerce:customerCreate', fields: {} },
          get: { rpc: 'woocommerce:customerGet', fields: {} },
          getAll: { rpc: 'woocommerce:customerGetAll', fields: {} },
          update: { rpc: 'woocommerce:customerUpdate', fields: {} },
          delete: { rpc: 'woocommerce:customerDelete', fields: {} },
        },
      },
    },
  },
  telegramtool: {
    // The n8n Telegram node has no `resource`, only an `operation`; the single
    // `message` resource carries them all.
    defaultResource: 'message',
    resources: {
      message: {
        defaultOperation: 'sendMessage',
        operations: {
          sendMessage: {
            rpc: 'telegram:messageSend',
            fields: { chat_id: { from: 'chatId' }, text: { from: 'text' } },
          },
          editMessageText: {
            rpc: 'telegram:messageEdit',
            fields: { chat_id: { from: 'chatId' }, text: { from: 'text' } },
          },
          deleteMessage: {
            rpc: 'telegram:messageDelete',
            fields: { chat_id: { from: 'chatId' } },
          },
          sendPhoto: {
            rpc: 'telegram:messageSendPhoto',
            fields: { chat_id: { from: 'chatId' } },
          },
          sendDocument: {
            rpc: 'telegram:messageSendDocument',
            fields: { chat_id: { from: 'chatId' } },
          },
          sendChatAction: {
            rpc: 'telegram:messageSendChatAction',
            fields: { chat_id: { from: 'chatId' } },
          },
          sendLocation: {
            rpc: 'telegram:messageSendLocation',
            fields: { chat_id: { from: 'chatId' } },
          },
          sendMediaGroup: {
            rpc: 'telegram:messageSendMediaGroup',
            fields: { chat_id: { from: 'chatId' } },
          },
        },
      },
    },
  },
  googledrivetool: {
    defaultResource: 'file',
    resources: {
      file: {
        defaultOperation: 'upload',
        operations: {
          download: {
            // NOTE: the Drive v3 OpenAPI restricts `alt` to `"json"`, so the
            // spec-derived addon can't express `alt=media` (raw media download).
            // Mapped to metadata get; media download is an addon-completeness gap.
            rpc: 'google-drive:filesGet',
            fields: {
              fileId: { fromRL: 'fileId' },
            },
          },
          upload: {
            rpc: 'google-drive:filesCreate',
            fields: {
              name: { from: 'name' },
              parents: { fromRL: 'folderId' },
            },
          },
          createFromText: {
            rpc: 'google-drive:filesCreate',
            fields: {
              name: { from: 'name' },
              parents: { fromRL: 'folderId' },
            },
          },
          copy: {
            rpc: 'google-drive:filesCopy',
            fields: {
              fileId: { fromRL: 'fileId' },
              name: { from: 'name' },
            },
          },
          move: {
            rpc: 'google-drive:filesUpdate',
            fields: {
              fileId: { fromRL: 'fileId' },
              addParents: { fromRL: 'folderId' },
            },
          },
          update: {
            rpc: 'google-drive:filesUpdate',
            fields: {
              fileId: { fromRL: 'fileId' },
              name: { from: 'newUpdatedFileName' },
            },
          },
          deleteFile: {
            rpc: 'google-drive:filesDelete',
            fields: {
              fileId: { fromRL: 'fileId' },
            },
          },
          share: {
            rpc: 'google-drive:permissionsCreate',
            fields: {
              fileId: { fromRL: 'fileId' },
              role: { from: 'role', default: 'reader' },
              type: { from: 'type', default: 'user' },
              emailAddress: { from: 'emailAddress' },
            },
          },
        },
      },
      folder: {
        defaultOperation: 'create',
        operations: {
          create: {
            rpc: 'google-drive:filesCreate',
            fields: {
              name: { from: 'name' },
              mimeType: { default: GOOGLE_DRIVE_FOLDER_MIME, asConst: true },
              parents: { fromRL: 'folderId' },
            },
          },
          deleteFolder: {
            rpc: 'google-drive:filesDelete',
            fields: {
              fileId: { fromRL: 'folderId' },
            },
          },
          share: {
            rpc: 'google-drive:permissionsCreate',
            fields: {
              fileId: { fromRL: 'folderId' },
              role: { from: 'role', default: 'reader' },
              type: { from: 'type', default: 'user' },
              emailAddress: { from: 'emailAddress' },
            },
          },
        },
      },
      drive: {
        defaultOperation: 'create',
        operations: {
          create: {
            rpc: 'google-drive:drivesCreate',
            fields: {
              name: { from: 'name' },
            },
          },
          deleteDrive: {
            rpc: 'google-drive:drivesDelete',
            fields: {
              driveId: { fromRL: 'driveId' },
            },
          },
          get: {
            rpc: 'google-drive:drivesGet',
            fields: {
              driveId: { fromRL: 'driveId' },
            },
          },
          list: {
            rpc: 'google-drive:drivesList',
            fields: {},
          },
          update: {
            rpc: 'google-drive:drivesUpdate',
            fields: {
              driveId: { fromRL: 'driveId' },
              name: { from: 'name' },
            },
          },
        },
      },
      fileFolder: {
        defaultOperation: 'search',
        operations: {
          search: {
            rpc: 'google-drive:filesList',
            fields: {
              q: { from: 'queryString' },
            },
          },
        },
      },
    },
  },
  notiontool: {
    defaultResource: 'page',
    resources: {
      databasePage: {
        defaultOperation: 'create',
        operations: {
          // NOTE: page create/update bodies (parent + properties) are nested n8n
          // collections not mapped here; the rpc wires, body is refinement work.
          create: { rpc: 'notion:postPage', fields: {} },
          getAll: {
            rpc: 'notion:postDatabaseQuery',
            fields: {
              data_source_id: { fromRL: 'databaseId' },
            },
          },
          update: {
            rpc: 'notion:patchPage',
            fields: {
              page_id: { fromRL: 'pageId' },
            },
          },
          get: {
            rpc: 'notion:retrieveAPage',
            fields: {
              page_id: { fromRL: 'pageId' },
            },
          },
        },
      },
      database: {
        defaultOperation: 'get',
        operations: {
          get: {
            rpc: 'notion:retrieveDatabase',
            fields: {
              database_id: { fromRL: 'databaseId' },
            },
          },
        },
      },
      block: {
        defaultOperation: 'append',
        operations: {
          getAll: {
            rpc: 'notion:getBlockChildren',
            fields: {
              block_id: { fromRL: 'blockId' },
            },
          },
          append: {
            rpc: 'notion:patchBlockChildren',
            fields: {
              block_id: { fromRL: 'blockId' },
            },
          },
        },
      },
      page: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'notion:postPage', fields: {} },
        },
      },
    },
  },
  googleanalyticstool: {
    defaultResource: 'report',
    resources: {
      report: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'google-analytics:reportRun', fields: {} },
          getReport: { rpc: 'google-analytics:reportRun', fields: {} },
        },
      },
    },
  },
  jiratool: {
    defaultResource: 'issue',
    resources: {
      issue: {
        defaultOperation: 'create',
        operations: {
          changelog: { rpc: 'jira:getChangeLogs', fields: {} },
          create: { rpc: 'jira:createIssue', fields: {} },
          delete: { rpc: 'jira:deleteIssue', fields: {} },
          get: { rpc: 'jira:getIssue', fields: {} },
          getAll: { rpc: 'jira:searchForIssuesUsingJql', fields: {} },
          notify: { rpc: 'jira:notify', fields: {} },
          transitions: { rpc: 'jira:getTransitions', fields: {} },
          update: { rpc: 'jira:editIssue', fields: {} },
        },
      },
      issueAttachment: {
        defaultOperation: 'add',
        operations: {
          add: { rpc: 'jira:addAttachment', fields: {} },
          get: { rpc: 'jira:getAttachment', fields: {} },
          remove: { rpc: 'jira:removeAttachment', fields: {} },
        },
      },
      issueComment: {
        defaultOperation: 'add',
        operations: {
          add: { rpc: 'jira:addComment', fields: {} },
          get: { rpc: 'jira:getComment', fields: {} },
          getAll: { rpc: 'jira:getComments', fields: {} },
          remove: { rpc: 'jira:deleteComment', fields: {} },
          update: { rpc: 'jira:updateComment', fields: {} },
        },
      },
      user: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'jira:createUser', fields: {} },
          delete: { rpc: 'jira:removeUser', fields: {} },
          get: { rpc: 'jira:getUser', fields: {} },
        },
      },
    },
  },
  mongodbptool: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'find',
        operations: {
          find: {
            rpc: 'mongodb:mongoFind',
            fields: { collection: { from: 'collection' } },
          },
          insert: {
            rpc: 'mongodb:mongoInsertMany',
            fields: { collection: { from: 'collection' } },
          },
          update: {
            rpc: 'mongodb:mongoUpdateMany',
            fields: { collection: { from: 'collection' } },
          },
          delete: {
            rpc: 'mongodb:mongoDeleteMany',
            fields: { collection: { from: 'collection' } },
          },
          aggregate: {
            rpc: 'mongodb:mongoAggregate',
            fields: { collection: { from: 'collection' } },
          },
        },
      },
    },
  },
  mysqltool: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'executeQuery',
        operations: {
          executeQuery: {
            rpc: 'mysql:executeQuery',
            fields: { query: { from: 'query' } },
          },
          insert: {
            rpc: 'mysql:insert',
            fields: { table: { fromRL: 'table' } },
          },
          update: {
            rpc: 'mysql:update',
            fields: { table: { fromRL: 'table' } },
          },
          select: {
            rpc: 'mysql:select',
            fields: { table: { fromRL: 'table' } },
          },
          upsert: {
            rpc: 'mysql:upsert',
            fields: { table: { fromRL: 'table' } },
          },
          delete: {
            rpc: 'mysql:deleteRows',
            fields: { table: { fromRL: 'table' } },
          },
        },
      },
    },
  },
  wordpresstool: {
    defaultResource: 'post',
    resources: {
      post: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'wordpress:createPost', fields: {} },
          get: { rpc: 'wordpress:getPost', fields: {} },
          getAll: { rpc: 'wordpress:listPosts', fields: {} },
          update: { rpc: 'wordpress:updatePost', fields: {} },
          delete: { rpc: 'wordpress:deletePost', fields: {} },
        },
      },
      page: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'wordpress:createPage', fields: {} },
          get: { rpc: 'wordpress:getPage', fields: {} },
          getAll: { rpc: 'wordpress:listPages', fields: {} },
          update: { rpc: 'wordpress:updatePage', fields: {} },
          delete: { rpc: 'wordpress:deletePage', fields: {} },
        },
      },
      user: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'wordpress:createUser', fields: {} },
          get: { rpc: 'wordpress:getUser', fields: {} },
          getAll: { rpc: 'wordpress:listUsers', fields: {} },
          update: { rpc: 'wordpress:updateUser', fields: {} },
          delete: { rpc: 'wordpress:deleteUser', fields: {} },
        },
      },
    },
  },
  twittertool: {
    defaultResource: 'tweet',
    resources: {
      tweet: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'twitter:tweetCreate', fields: {} },
          delete: { rpc: 'twitter:tweetDelete', fields: {} },
          like: { rpc: 'twitter:tweetLike', fields: {} },
          retweet: { rpc: 'twitter:tweetRetweet', fields: {} },
          search: { rpc: 'twitter:tweetSearch', fields: {} },
        },
      },
      directMessage: {
        defaultOperation: 'create',
        operations: {
          create: { rpc: 'twitter:directMessageCreate', fields: {} },
        },
      },
      list: {
        defaultOperation: 'add',
        operations: {
          add: { rpc: 'twitter:listAdd', fields: {} },
        },
      },
      user: {
        defaultOperation: 'searchUser',
        operations: {
          searchUser: { rpc: 'twitter:userSearch', fields: {} },
        },
      },
    },
  },
  emailsendtool: {
    defaultResource: 'email',
    resources: {
      email: {
        defaultOperation: 'send',
        operations: {
          send: {
            rpc: 'email-send:emailSend',
            fields: {
              subject: { from: 'subject' },
              text: { from: 'text' },
            },
          },
        },
      },
    },
  },
  redistool: {
    defaultResource: 'default',
    resources: {
      default: {
        defaultOperation: 'get',
        operations: {
          get: { rpc: 'redis:keyGet', fields: { key: { from: 'key' } } },
          set: {
            rpc: 'redis:keySet',
            fields: { key: { from: 'key' }, value: { from: 'value' } },
          },
          delete: { rpc: 'redis:keyDelete', fields: { key: { from: 'key' } } },
          incr: { rpc: 'redis:keyIncr', fields: { key: { from: 'key' } } },
          keys: {
            rpc: 'redis:keys',
            fields: { pattern: { from: 'keyPattern' } },
          },
          publish: {
            rpc: 'redis:publish',
            fields: { channel: { from: 'channel' } },
          },
        },
      },
    },
  },
}

/**
 * Resolve an n8n integration node (by `type` short name + its `resource`/
 * `operation` params) to the addon function it maps onto, applying n8n's
 * default-resource / default-operation omission rules. Returns undefined when
 * the service, resource, or operation isn't mapped (→ stays a stub).
 */
export function integrationSpecFor(
  typeShort: string,
  parameters?: Record<string, unknown>
): NativeNodeSpec | undefined {
  const node = INTEGRATION_NODES[typeShort.toLowerCase()]
  if (!node) return undefined
  const p = parameters ?? {}
  const resourceKey = (p.resource as string) || node.defaultResource
  const resource = node.resources[resourceKey]
  if (!resource) return undefined
  const operationKey =
    (p[node.operationParam ?? 'operation'] as string) ||
    resource.defaultOperation
  return resource.operations[operationKey]
}
