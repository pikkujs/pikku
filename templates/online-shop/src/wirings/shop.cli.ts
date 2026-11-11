import {
  wireCLI,
  defineCLICommands,
  pikkuCLICommand,
  pikkuCLIRender,
} from '#pikku/cli/pikku-cli-types.gen.js'
import { dailySalesReport } from '../functions/reports/daily-sales-report.function.js'
import { cleanupAbandonedBaskets } from '../functions/reports/cleanup-abandoned-baskets.function.js'
import { listItems } from '../functions/items/list-items.function.js'

// @snippet start cliSubcommands
// @snippet start wireCli
wireCLI({
  program: 'shop',
  commands: {
    report: pikkuCLICommand({
      description: 'Generate the daily sales report',
      func: dailySalesReport,
    }),
    cleanup: pikkuCLICommand({
      description: 'Remove baskets abandoned for more than 24 h',
      func: cleanupAbandonedBaskets,
    }),
    items: pikkuCLICommand({
      description: 'List all items in the catalogue',
      func: listItems,
    }),
  },
})
// @snippet end wireCli
// @snippet end cliSubcommands

// @snippet start cliWiring
// @snippet start cliCommandContract
// The command map is a contract of its own, so it can be declared once and
// wired wherever the program is assembled.
const shopCommands = defineCLICommands({
  report: pikkuCLICommand({
    description: 'Generate the daily sales report',
    func: dailySalesReport,
  }),
  cleanup: pikkuCLICommand({
    description: 'Remove baskets abandoned for more than 24 h',
    func: cleanupAbandonedBaskets,
  }),
  items: pikkuCLICommand({
    description: 'List all items in the catalogue',
    func: listItems,
  }),
})
// @snippet end cliCommandContract

wireCLI({ program: 'shop', commands: shopCommands })
// @snippet end cliWiring

// @snippet start cliUsage
// $ pikku shop report
// [2026-06-09] Daily sales: 14 orders · £1,240.00 revenue
//
// $ pikku shop cleanup
// Removed 3 abandoned baskets (older than 24 h)
//
// $ pikku shop items --categoryId electronics
// ID           NAME             PRICE    STOCK
// item-001     USB-C Hub        £29.99   42
// item-002     Mechanical KB    £89.99   7
// @snippet end cliUsage

// @snippet start cliRenderer
type ItemList = {
  items: Array<{
    itemId: string
    name: string
    priceCents: number
    stock: number
  }>
}

export const itemRenderer = pikkuCLIRender<ItemList>((_services, { items }) => {
  const rows = items.map(
    (i) =>
      `${i.itemId.padEnd(14)} ${i.name.padEnd(20)} £${(i.priceCents / 100).toFixed(2).padStart(8)}  ${String(i.stock).padStart(5)}`
  )
  console.log(
    ['ID             NAME                  PRICE     STOCK', ...rows].join('\n')
  )
})
// @snippet end cliRenderer
