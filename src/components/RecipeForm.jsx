import { useState } from 'react'
import { CATEGORIES, parseIngredients, parseSteps, parseTags } from '../pages/recipesData'
import Sheet from './ds/Sheet.jsx'
import Button from './ds/Button.jsx'
import Icon from './ds/Icon.jsx'
import { Field, Input, Select } from './ds/Field.jsx'

const DIFFICULTIES = ['Easy', 'Medium', 'Hard']

export default function RecipeForm({ onClose, onSubmit }) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('main')
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
      setError(err.message || 'That recipe did not save. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Sheet
      title="Add a recipe"
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="fh-recipe-form" loading={submitting}>
            {submitting ? 'Saving…' : 'Save recipe'}
          </Button>
        </>
      }
    >
      {error && (
        <div className="fh-notice fh-notice--danger">
          <Icon name="alert-circle" size={16} />
          {error}
        </div>
      )}

      <form id="fh-recipe-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
        <Field label="Title" htmlFor="rb-title">
          <Input id="rb-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>

        <Field label="Category" htmlFor="rb-category">
          <Select id="rb-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.filter((c) => c.id !== 'all').map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Difficulty" htmlFor="rb-difficulty">
          <Select id="rb-difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Serves" htmlFor="rb-serves">
          <Input id="rb-serves" type="number" min="1" value={serves} onChange={(e) => setServes(e.target.value)} />
        </Field>

        <Field label="Time" htmlFor="rb-time">
          <Input id="rb-time" placeholder="e.g. 45 min" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>

        <Field label="Tags" htmlFor="rb-tags">
          <Input
            id="rb-tags"
            placeholder="Comfort food, kid-friendly"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </Field>

        <Field
          label="Ingredients"
          htmlFor="rb-ingredients"
          hint={'One per line. Start a line with "## " for a group heading. Use "Name | amount" — the amount is optional.'}
        >
          <Input
            as="textarea"
            id="rb-ingredients"
            placeholder={'## Meatballs\nMinced beef | 500g\nGarlic cloves, minced | 2\n## Sauce\nTomato passata | 500g'}
            value={ingredients}
            onChange={(e) => setIngredients(e.target.value)}
          />
        </Field>

        <Field
          label="Method"
          htmlFor="rb-steps"
          hint="One step per line. Mention a time like 20 minutes to get an automatic timer in Cook Mode."
        >
          <Input
            as="textarea"
            id="rb-steps"
            placeholder={'Brown the meatballs in a hot pan, about 8 minutes.\nAdd the sauce and simmer for 20 minutes.'}
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
          />
        </Field>

        <Field label="Notes and tips (optional)" htmlFor="rb-notes">
          <Input as="textarea" id="rb-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </form>
    </Sheet>
  )
}
