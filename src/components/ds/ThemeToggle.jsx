import IconButton from './IconButton.jsx'
import { useTheme } from '../../context/ThemeContext.jsx'

const ICON_BY_THEME = { system: 'monitor-smartphone', light: 'sun', dark: 'moon' }
const LABEL_BY_THEME = {
  system: 'Theme: matching device',
  light: 'Theme: light',
  dark: 'Theme: dark',
}

export default function ThemeToggle() {
  const { theme, cycleTheme } = useTheme()
  return (
    <IconButton
      icon={ICON_BY_THEME[theme]}
      label={`${LABEL_BY_THEME[theme]} — tap to change`}
      onClick={cycleTheme}
    />
  )
}
