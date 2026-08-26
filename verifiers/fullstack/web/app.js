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

const renderNotes = async () => {
  const response = await fetch('/notes')
  if (!response.ok) {
    $('state').textContent = `notes refused: ${response.status}`
    return
  }
  const { notes } = await response.json()
  $('notes').replaceChildren(
    ...notes.map(({ id, text }) => {
      const item = document.createElement('li')
      item.dataset.testid = `note-${id}`
      item.textContent = text
      return item
    })
  )
}

const render = async () => {
  const { state } = await (await fetch('/_pikku/data/status')).json()
  $('state').textContent = state
  const open = state === 'unlocked'
  $('gate').hidden = open
  $('notes-panel').hidden = !open

  if (open) {
    await renderNotes()
    return
  }

  const first = state === 'uninitialized'
  $('gate-label').textContent = first ? 'Choose a passphrase' : 'Passphrase'
  $('submit').textContent = first ? 'Create' : 'Unlock'
}

$('submit').addEventListener('click', async () => {
  const first = $('state').textContent === 'uninitialized'
  const { ok, status } = await post(
    first ? '/_pikku/data/initialize' : '/_pikku/data/unlock',
    { passphrase: $('passphrase').value }
  )
  // Deliberately non-hinting: a message that separated "wrong passphrase" from
  // "too many guesses" would tell an attacker which of the two they hit.
  $('gate-error').textContent = ok ? '' : `refused (${status})`
  if (ok) {
    $('passphrase').value = ''
  }
  await render()
})

$('add').addEventListener('click', async () => {
  await post('/notes', { text: $('new-note').value })
  $('new-note').value = ''
  await renderNotes()
})

await render()
