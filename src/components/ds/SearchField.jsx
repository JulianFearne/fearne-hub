import Icon from './Icon.jsx'
import IconButton from './IconButton.jsx'

export default function SearchField({ value, onChange, placeholder = 'Search…', ...rest }) {
  return (
    <span className="fh-search">
      <Icon name="search" size={18} className="fh-search__icon" />
      <input
        type="text"
        className="fh-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        {...rest}
      />
      {value && (
        <IconButton
          icon="x"
          label="Clear search"
          className="fh-search__clear"
          onClick={() => onChange('')}
        />
      )}
    </span>
  )
}
