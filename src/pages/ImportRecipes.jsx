import { useRef, useState } from 'react'
import { CATEGORIES, addRecipe, fetchRecipes } from './recipesData'
import Card from '../components/ds/Card.jsx'
import Button from '../components/ds/Button.jsx'
import Icon from '../components/ds/Icon.jsx'

const VALID_CATEGORIES = CATEGORIES.filter((c) => c.id !== 'all').map((c) => c.id)
const VALID_DIFFICULTIES = ['Easy', 'Medium', 'Hard']

// Validates one recipe object; returns a list of problems (empty = valid).
function validateRecipe(r, index) {
  const problems = []
  const label = r?.title ? `"${r.title}"` : `Recipe ${index + 1}`

  if (typeof r !== 'object' || r === null || Array.isArray(r)) {
    return [`Recipe ${index + 1}: not a valid recipe object.`]
  }
  if (!r.title || typeof r.title !== 'string') problems.push(`${label}: missing a title.`)
  if (!VALID_CATEGORIES.includes(r.category))
    problems.push(`${label}: category must be one of ${VALID_CATEGORIES.join(', ')}.`)
  if (!Array.isArray(r.ingredients) || r.ingredients.length === 0)
    problems.push(`${label}: needs at least one ingredient.`)
  else {
    r.ingredients.forEach((i, idx) => {
      const isGroup = i && typeof i.group === 'string'
      const isIngredient = i && typeof i.name === 'string'
      if (!isGroup && !isIngredient)
        problems.push(`${label}: ingredient ${idx + 1} needs either a "name" or a "group".`)
    })
  }
  if (!Array.isArray(r.steps) || r.steps.length === 0)
    problems.push(`${label}: needs at least one step.`)
  else if (r.steps.some((s) => typeof s !== 'string'))
    problems.push(`${label}: every step must be text.`)
  if (r.difficulty != null && !VALID_DIFFICULTIES.includes(r.difficulty))
    problems.push(`${label}: difficulty must be Easy, Medium, or Hard.`)
  if (r.serves != null && typeof r.serves !== 'number')
    problems.push(`${label}: "serves" must be a number.`)
  if (r.tags != null && (!Array.isArray(r.tags) || r.tags.some((t) => typeof t !== 'string')))
    problems.push(`${label}: "tags" must be a list of text values.`)

  return problems
}

// Keeps only the fields the database knows about, dropping anything extra.
function cleanRecipe(r) {
  return {
    title: r.title.trim(),
    category: r.category,
    emoji: typeof r.emoji === 'string' && r.emoji.trim() ? r.emoji.trim() : '🍽️',
    serves: typeof r.serves === 'number' ? r.serves : null,
    time: typeof r.time === 'string' ? r.time : null,
    difficulty: VALID_DIFFICULTIES.includes(r.difficulty) ? r.difficulty : null,
    tags: Array.isArray(r.tags) ? r.tags : [],
    ingredients: r.ingredients.map((i) =>
      i.group ? { group: i.group } : { name: i.name, amount: i.amount || undefined }
    ),
    steps: r.steps,
    notes: typeof r.notes === 'string' && r.notes.trim() ? r.notes : null,
  }
}

export default function ImportRecipes() {
  const fileRef = useRef(null)
  const [parsed, setParsed] = useState(null) // validated recipes ready to import
  const [problems, setProblems] = useState([])
  const [duplicates, setDuplicates] = useState([])
  const [status, setStatus] = useState('idle') // idle | previewing | importing | done | error
  const [imported, setImported] = useState([])
  const [error, setError] = useState(null)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setProblems([])
    setParsed(null)
    setDuplicates([])
    setStatus('idle')

    let data
    try {
      data = JSON.parse(await file.text())
    } catch (err) {
      setError("That file isn't valid JSON. Make sure you're uploading the .json file exactly as Claude produced it.")
      return
    }

    if (!Array.isArray(data)) {
      setError('The file should contain a list of recipes (a top-level JSON array), even for a single recipe.')
      return
    }
    if (data.length === 0) {
      setError('The file contains no recipes.')
      return
    }

    const allProblems = data.flatMap((r, i) => validateRecipe(r, i))
    if (allProblems.length > 0) {
      setProblems(allProblems)
      return
    }

    const cleaned = data.map(cleanRecipe)

    // Warn about titles that already exist in the cookbook
    try {
      const existing = await fetchRecipes()
      const existingTitles = new Set(existing.map((r) => r.title.toLowerCase()))
      setDuplicates(cleaned.filter((r) => existingTitles.has(r.title.toLowerCase())).map((r) => r.title))
    } catch (err) {
      // If the duplicate check fails we still allow import; it's only a warning
    }

    setParsed(cleaned)
    setStatus('previewing')
  }

  async function runImport() {
    setStatus('importing')
    setImported([])
    setError(null)
    try {
      for (const recipe of parsed) {
        await addRecipe(recipe)
        setImported((prev) => [...prev, recipe.title])
      }
      setStatus('done')
    } catch (err) {
      setError(err.message || 'Something went wrong while saving.')
      setStatus('error')
    }
  }

  function reset() {
    setParsed(null)
    setProblems([])
    setDuplicates([])
    setImported([])
    setError(null)
    setStatus('idle')
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <p style={{ font: 'var(--type-body)', color: 'var(--ink-2)', marginBottom: 'var(--sp-6)' }}>
        Upload a recipe <strong>.json</strong> file in the Fearne Hub format. Ask Claude to create
        recipes using the format spec, download the file it produces, and drop it here.
      </p>

      <Card style={{ marginBottom: 'var(--sp-6)' }}>
        <input ref={fileRef} type="file" accept=".json,application/json" onChange={handleFile} />
      </Card>

      {error && (
        <div className="fh-notice fh-notice--danger" style={{ display: 'block' }}>
          <p style={{ font: 'var(--type-label)', marginBottom: 'var(--sp-2)' }}>
            <Icon name="alert-circle" size={16} /> That file has a problem
          </p>
          {error}
        </div>
      )}

      {problems.length > 0 && (
        <div className="fh-notice fh-notice--danger" style={{ display: 'block' }}>
          <strong>The file has some problems — nothing was imported:</strong>
          <ul style={{ margin: 'var(--sp-4) 0 0 1.1rem' }}>
            {problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {status === 'previewing' && parsed && (
        <div>
          <p className="fh-recipedetail__h">
            Ready to import {parsed.length} recipe{parsed.length === 1 ? '' : 's'}
          </p>
          <div className="fh-rows" style={{ marginBottom: 'var(--sp-6)' }}>
            {parsed.map((r) => (
              <div key={r.title} className="fh-row fh-row--static">
                <span className="fh-row__lead">
                  <Icon name={CATEGORIES.find((c) => c.id === r.category)?.icon ?? 'utensils'} size={18} />
                </span>
                <span className="fh-row__body">
                  <span className="fh-row__label">{r.title}</span>
                  <span className="fh-row__meta">
                    {CATEGORIES.find((c) => c.id === r.category)?.label}, {r.ingredients.filter((i) => i.name).length}{' '}
                    ingredients, {r.steps.length} steps
                  </span>
                </span>
              </div>
            ))}
          </div>

          {duplicates.length > 0 && (
            <div className="fh-notice" style={{ background: 'var(--warning-soft)', color: 'var(--warning-soft-ink)', display: 'block' }}>
              Heads up: {duplicates.join(', ')} {duplicates.length === 1 ? 'already exists' : 'already exist'} in the
              cookbook. Importing will add {duplicates.length === 1 ? 'a duplicate' : 'duplicates'} rather than
              replacing.
            </div>
          )}

          <Button block onClick={runImport} style={{ marginBottom: 'var(--sp-5)' }}>
            Import {parsed.length} recipe{parsed.length === 1 ? '' : 's'}
          </Button>
          <Button variant="quiet" block onClick={reset}>
            Cancel
          </Button>
        </div>
      )}

      {status === 'importing' && (
        <p className="fh-loading">
          Importing… ({imported.length} of {parsed?.length} done)
        </p>
      )}

      {status === 'done' && (
        <div>
          <div className="fh-notice fh-notice--success">
            <Icon name="check-circle" size={16} />
            Done — added {imported.length} recipe{imported.length === 1 ? '' : 's'} to the cookbook.
          </div>
          <Button block onClick={reset}>
            Import another file
          </Button>
        </div>
      )}

      {status === 'error' && (
        <div>
          <div className="fh-notice fh-notice--danger" style={{ display: 'block' }}>
            {error}
            {imported.length > 0 && (
              <div style={{ marginTop: 'var(--sp-4)' }}>
                These were saved before the error, so they won't need re-importing: {imported.join(', ')}
              </div>
            )}
          </div>
          <Button block onClick={reset}>
            Start over
          </Button>
        </div>
      )}
    </div>
  )
}
