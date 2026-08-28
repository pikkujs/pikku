/**
 * The frontend half of the fullstack verifier, hand-written rather than built.
 *
 * pikku only ever serves a frontend's *output*, so a directory of finished
 * files is exactly what `frontend.dir` names in production too — and skipping
 * a bundler keeps the verifier measuring pikku rather than someone's vite
 * config. What it does exercise is the part no HTTP assertion reaches: a real
 * browser, on the served origin, running the fetches the page itself makes.
 */
const $ = (id) => document.querySelector(`[data-testid="${id}"]`)

const post = async (path, body) => {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { ok: response.ok, status: response.status }
}

const render = async () => {
  const response = await fetch('/notes')
  if (!response.ok) {
    $('state').textContent = `notes refused: ${response.status}`
    return
  }
  const { notes } = await response.json()
  $('state').textContent = 'ready'
  $('notes').replaceChildren(
    ...notes.map(({ id, text }) => {
      const item = document.createElement('li')
      item.dataset.testid = `note-${id}`
      item.textContent = text
      return item
    })
  )
}

$('add').addEventListener('click', async () => {
  await post('/notes', { text: $('new-note').value })
  $('new-note').value = ''
  await render()
})

await render()
