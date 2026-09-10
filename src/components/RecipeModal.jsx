import { CATEGORIES } from '../pages/recipesData'
import Sheet from './ds/Sheet.jsx'
import Button from './ds/Button.jsx'
import Icon from './ds/Icon.jsx'

function catLabel(id) {
  return CATEGORIES.find((c) => c.id === id)?.label || id
}
function catIcon(id) {
  return CATEGORIES.find((c) => c.id === id)?.icon ?? 'utensils'
}

export default function RecipeModal({ recipe, canDelete, onClose, onDelete, onCook }) {
  return (
    <Sheet title={recipe.title} onClose={onClose} wide>
      <span className="fh-recipedetail__mark">
        <Icon name={catIcon(recipe.category)} size={26} />
      </span>
      <p className="fh-recipedetail__cat">{catLabel(recipe.category)}</p>
      <p className="fh-recipedetail__title">{recipe.title}</p>

      <div className="fh-recipedetail__facts">
        {recipe.time && (
          <span className="fh-recipedetail__fact">
            <Icon name="clock" size={14} />
            {recipe.time}
          </span>
        )}
        {recipe.serves && (
          <span className="fh-recipedetail__fact">
            <Icon name="users" size={14} />
            Serves {recipe.serves}
          </span>
        )}
        {recipe.difficulty && (
          <span className="fh-recipedetail__fact">
            <Icon name="sparkles" size={14} />
            {recipe.difficulty}
          </span>
        )}
      </div>

      {(recipe.tags || []).length > 0 && (
        <div className="fh-recipedetail__tags">
          {recipe.tags.map((t) => (
            <span className="fh-badge" key={t}>
              {t}
            </span>
          ))}
        </div>
      )}

      {recipe.steps?.length > 0 && (
        <Button variant="primary" icon="chef-hat" block onClick={onCook}>
          Start cooking
        </Button>
      )}

      <div className="fh-recipedetail__cols" style={{ marginTop: 'var(--sp-8)' }}>
        <div>
          <p className="fh-recipedetail__h">Ingredients</p>
          {(recipe.ingredients || []).map((i, idx) =>
            i.group ? (
              <p key={idx} className="fh-recipedetail__group">
                {i.group}
              </p>
            ) : (
              <div key={idx} className="fh-recipedetail__ing">
                <span>{i.name}</span>
                {i.amount && <span>{i.amount}</span>}
              </div>
            )
          )}
        </div>
        <div>
          <p className="fh-recipedetail__h">Method</p>
          {(recipe.steps || []).map((s, i) => (
            <div key={i} className="fh-recipedetail__step">
              <span className="fh-recipedetail__num">{i + 1}</span>
              <span>{s}</span>
            </div>
          ))}
        </div>
      </div>

      {recipe.notes && (
        <div className="fh-recipedetail__notes">
          <strong>Notes and tips</strong>
          {recipe.notes}
        </div>
      )}

      {canDelete && (
        <Button variant="ghost" icon="trash-2" style={{ marginTop: 'var(--sp-7)', color: 'var(--danger)' }} onClick={onDelete}>
          Delete this recipe
        </Button>
      )}
    </Sheet>
  )
}
