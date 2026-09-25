import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LIST_KINDS, fetchLists, listKindFor } from './listsData'
import Card, { CardTitle, CardMeta } from '../components/ds/Card.jsx'
import Icon from '../components/ds/Icon.jsx'

// The Lists tab: one tile per kind of list, each opening its own section.
export default function Lists() {
  const [counts, setCounts] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchLists()
      .then((lists) => {
        const next = {}
        for (const l of lists) {
          const kind = listKindFor(l)
          next[kind] = (next[kind] || 0) + 1
        }
        setCounts(next)
      })
      .catch((err) => setError(err.message))
  }, [])

  return (
    <div>
      {error && (
        <div className="fh-notice fh-notice--danger">
          <Icon name="alert-circle" size={16} />
          {error}
        </div>
      )}

      <div className="fh-lists__grid">
        {Object.entries(LIST_KINDS).map(([kind, k]) => {
          const n = counts?.[kind] || 0
          return (
            <Card key={kind} as={Link} to={`/lists/${kind}`} tile>
              <span className="fh-recipes__mark">
                <Icon name={k.icon} size={18} />
              </span>
              <div>
                <CardTitle>{k.title}</CardTitle>
                <CardMeta>{counts ? `${n} ${n === 1 ? 'list' : 'lists'} · ${k.blurb}` : k.blurb}</CardMeta>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
