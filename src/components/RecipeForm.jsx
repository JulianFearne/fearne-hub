import { useState } from 'react'
import { CATEGORIES, parseIngredients, parseSteps, parseTags } from '../pages/recipesData'

const DIFFICULTIES = ['Easy', 'Medium', 'Hard']

export default function RecipeForm({ onClose, onSubmit }) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('mains')
  const [emoji, setEmoji] = useState('🍽️')
  const [serves, setServes] = useState('')
  const [time, setTime] = useState('')
  const [difficulty, setDifficulty] = useState('Easy')
  const [tags, setTags] = useState('')
  const [ingredients, setIngredients] = useState('')
  const [steps, setSteps] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!title.trim()) {
      setError('Give the recipe a title.')
      return
    }

    setSubmitting(true)
    try {
      await onSubmit({
        title: title.trim(),
        category,
        emoji: emoji.trim() || '🍽️',
        serves: serves ? Number(serves) : null,
        time: time.trim() || null,
        difficulty,
        tags: parseTags(tags),
        ingredients: parseIngredients(ingredients),
        steps: parseSteps(steps),
        notes: notes.trim() || null,
      })
      onClose()
    } catch (err) {
      setError(err.message || 'Something went wrong saving that recipe.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rb-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rb-modal">
        <div className="rb-modal-close">
          <button className="rb-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="rb-modal-body">
          <div className="rb-modal-title">Add a recipe</div>

          {error && <div className="rb-form-error">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="rb-form-field">
              <label htmlFor="rb-title">Title</label>
              <input id="rb-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>

            <div className="rb-form-row">
              <div className="rb-form-field">
                <label htmlFor="rb-category">Category</label>
                <select id="rb-category" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.filter((c) => c.id !== 'all').map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rb-form-field">
                <label htmlFor="rb-emoji">Emoji</label>
                <input id="rb-emoji" value={emoji} onChange={(e) => setEmoji(e.target.value)} />
              </div>
              <div className="rb-form-field">
                <label htmlFor="rb-difficulty">Difficulty</label>
                <select id="rb-difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                  {DIFFICULTIES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rb-form-row">
              <div className="rb-form-field">
                <label htmlFor="rb-serves">Serves</label>
                <input id="rb-serves" type="number" min="1" value={serves} onChange={(e) => setServes(e.target.value)} />
              </div>
              <div className="rb-form-field">
                <label htmlFor="rb-time">Time</label>
                <input id="rb-time" placeholder="e.g. 45 min" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
              <div className="rb-form-field">
                <label htmlFor="rb-tags">Tags</label>
                <input
                  id="rb-tags"
                  placeholder="Comfort Food, Kid-Friendly"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                />
              </div>
            </div>

            <div className="rb-form-field">
              <label htmlFor="rb-ingredients">Ingredients</label>
              <textarea
                id="rb-ingredients"
                placeholder={'## Meatballs\nMinced beef | 500g\nGarlic cloves, minced | 2\n## Sauce\nTomato passata | 500g'}
                value={ingredients}
                onChange={(e) => setIngredients(e.target.value)}
              />
              <div className="rb-form-hint">
                One per line. Start a line with "## " for a group heading. Use "Name | amount" — the
                amount is optional.
              </div>
            </div>

            <div className="rb-form-field">
              <label htmlFor="rb-steps">Method</label>
              <textarea
                id="rb-steps"
                placeholder={'Brown the meatballs in a hot pan, about 8 minutes.\nAdd the sauce and simmer for 20 minutes.'}
                value={steps}
                onChange={(e) => setSteps(e.target.value)}
              />
              <div className="rb-form-hint">
                One step per line. Mention a time like "20 minutes" to get an automatic timer in Cook
                Mode.
              </div>
            </div>

            <div className="rb-form-field">
              <label htmlFor="rb-notes">Notes &amp; tips (optional)</label>
              <textarea id="rb-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <button className="rb-form-submit" type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save recipe'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
