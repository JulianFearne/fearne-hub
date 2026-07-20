import { CATEGORIES } from '../pages/recipesData'

function catLabel(id) {
  return CATEGORIES.find((c) => c.id === id)?.label || id
}

export default function RecipeModal({ recipe, canDelete, onClose, onDelete, onCook }) {
  return (
    <div className="rb-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rb-modal">
        <div className="rb-modal-close">
          <button className="rb-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={`rb-modal-hero acc-${recipe.category}`}>{recipe.emoji}</div>

        <div className="rb-modal-body">
          <div className="rb-modal-cat">{catLabel(recipe.category)}</div>
          <div className="rb-modal-title">{recipe.title}</div>
          <div className="rb-modal-meta">
            {recipe.time && <span>⏱ {recipe.time}</span>}
            {recipe.serves && <span>👤 Serves {recipe.serves}</span>}
            {recipe.difficulty && <span>⭐ {recipe.difficulty}</span>}
            {(recipe.tags || []).map((t) => (
              <span key={t}>🏷 {t}</span>
            ))}
          </div>

          {recipe.steps?.length > 0 && (
            <button className="rb-cook-start-btn" onClick={onCook}>
              ▶ &nbsp;Start Cook Mode
            </button>
          )}

          <div className="rb-two-col">
            <div>
              <div className="rb-section-label">Ingredients</div>
              <ul className="rb-ingredients-list">
                {(recipe.ingredients || []).map((i, idx) =>
                  i.group ? (
                    <li key={idx} className="rb-ing-group">
                      {i.group}
                    </li>
                  ) : (
                    <li key={idx}>
                      <span className="rb-ing-dot" />
                      <span>
                        {i.name}
                        {i.amount ? (
                          <>
                            {' — '}
                            <strong>{i.amount}</strong>
                          </>
                        ) : null}
                      </span>
                    </li>
                  )
                )}
              </ul>
            </div>
            <div>
              <div className="rb-section-label">Method</div>
              <ol className="rb-steps-list">
                {(recipe.steps || []).map((s, i) => (
                  <li key={i}>
                    <span className="rb-step-num">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {recipe.notes && (
            <div className="rb-notes-box">
              <strong>Notes &amp; Tips</strong>
              {recipe.notes}
            </div>
          )}

          {canDelete && (
            <button className="rb-delete-btn" onClick={onDelete}>
              Delete this recipe
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
