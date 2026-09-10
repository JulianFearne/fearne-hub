import {
  House,
  Soup,
  Utensils,
  ChefHat,
  ShoppingBasket,
  CalendarDays,
  Dumbbell,
  Gamepad2,
  ListChecks,
  Clock,
  Users,
  User,
  Check,
  Plus,
  Minus,
  X,
  Search,
  SearchX,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Pencil,
  Share2,
  Trash2,
  Ellipsis,
  Play,
  Pause,
  Merge,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Info,
  Sparkles,
  LogOut,
  Shield,
} from 'lucide-react'

// Lucide (2px stroke, rounded caps), the design system's icon substitution.
// Swapping icon sets means editing this one file.
const ICONS = {
  house: House,
  soup: Soup,
  utensils: Utensils,
  'chef-hat': ChefHat,
  'shopping-basket': ShoppingBasket,
  'calendar-days': CalendarDays,
  dumbbell: Dumbbell,
  'gamepad-2': Gamepad2,
  'list-checks': ListChecks,
  clock: Clock,
  users: Users,
  user: User,
  check: Check,
  plus: Plus,
  minus: Minus,
  x: X,
  search: Search,
  'search-x': SearchX,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'chevron-down': ChevronDown,
  pencil: Pencil,
  'share-2': Share2,
  'trash-2': Trash2,
  ellipsis: Ellipsis,
  play: Play,
  pause: Pause,
  merge: Merge,
  'alert-circle': AlertCircle,
  'alert-triangle': AlertTriangle,
  'check-circle': CheckCircle,
  info: Info,
  sparkles: Sparkles,
  'log-out': LogOut,
  shield: Shield,
}

export default function Icon({ name, size = 20, label, className, ...rest }) {
  const Lucide = ICONS[name]
  if (!Lucide) return null
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true }
  return (
    <Lucide
      size={size}
      strokeWidth={2}
      className={className}
      {...a11y}
      {...rest}
    />
  )
}
