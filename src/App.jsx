import { Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import HubHeader from './components/ds/HubHeader.jsx'
import TabBar from './components/ds/TabBar.jsx'
import IconButton from './components/ds/IconButton.jsx'
import ThemeToggle from './components/ds/ThemeToggle.jsx'
import Home from './pages/Home.jsx'
import Login from './pages/Login.jsx'
import PendingApproval from './pages/PendingApproval.jsx'
import Admin from './pages/Admin.jsx'
import Recipes from './pages/Recipes.jsx'
import Chores from './pages/Chores.jsx'
import GamesHub from './pages/games/GamesHub.jsx'
import ConnectFour from './pages/games/connect-four/ConnectFour.jsx'
import Hangman from './pages/games/hangman/Hangman.jsx'
import Sudoku from './pages/games/sudoku/Sudoku.jsx'
import Freecell from './pages/games/freecell/Freecell.jsx'
import GoFish from './pages/games/go-fish/GoFish.jsx'
import AnimalPlaceThing from './pages/AnimalPlaceThing.jsx'
import ImportRecipes from './pages/ImportRecipes.jsx'
import MealPlanner from './pages/MealPlanner.jsx'
import ShoppingLists from './pages/ShoppingLists.jsx'
import WorkoutHub from './pages/WorkoutHub.jsx'
import WorkoutTracker from './pages/WorkoutTracker.jsx'
import WorkoutHistory from './pages/WorkoutHistory.jsx'

const TAB_ITEMS = [
  { to: '/', label: 'Home', icon: 'house', end: true },
  { to: '/recipes', label: 'Cook', icon: 'soup' },
  { to: '/shopping', label: 'Shop', icon: 'shopping-basket' },
  { to: '/workouts', label: 'Move', icon: 'dumbbell' },
  { to: '/games', label: 'Play', icon: 'gamepad-2' },
]

// Header per route. `tab: true` marks a tab-bar destination (no back
// button); everything else gets a back arrow to the path given.
const ROUTE_HEADERS = {
  '/': { wordmark: true, tab: true },
  '/recipes': { title: 'Recipes', tab: true },
  '/import': { title: 'Import recipes', back: '/recipes' },
  '/planner': { title: "This week's meals", back: '/', wide: true },
  '/shopping': { title: 'Shopping lists', tab: true },
  '/chores': { title: 'Chores', back: '/' },
  '/games': { title: 'Games', tab: true },
  '/games/connect-four': { title: 'Connect Four', back: '/games' },
  '/games/hangman': { title: 'Hangman', back: '/games' },
  '/games/sudoku': { title: 'Sudoku', back: '/games' },
  '/games/freecell': { title: 'Freecell', back: '/games' },
  '/games/go-fish': { title: 'Go Fish', back: '/games' },
  '/admin': { title: 'Family admin', back: '/' },
  '/workouts': { title: 'Workouts', tab: true },
  '/workouts/tracker': { title: 'Workout', back: '/workouts' },
  '/workouts/history': { title: 'History', back: '/workouts' },
}

function HubShell({ children }) {
  const { isAdmin, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const meta = ROUTE_HEADERS[location.pathname] ?? { title: 'Fearne Hub', back: '/' }

  const actions = (
    <>
      <ThemeToggle />
      {location.pathname === '/' && (
        <>
          {isAdmin && <IconButton icon="shield" label="Admin" onClick={() => navigate('/admin')} />}
          <IconButton icon="log-out" label="Sign out" onClick={() => signOut()} />
        </>
      )}
    </>
  )

  return (
    <div className={`fh-app${meta.wide ? ' fh-app--wide' : ''}`}>
      <HubHeader
        wordmark={meta.wordmark}
        title={meta.title}
        onBack={meta.back ? () => navigate(meta.back) : null}
        actions={actions}
      />
      <div className="fh-app__body">{children}</div>
      <TabBar items={TAB_ITEMS} />
    </div>
  )
}

export default function App() {
  const location = useLocation()

  // The game is playable by guests too (no account needed), so it gets no
  // hub chrome at all — see the route below.
  if (location.pathname === '/games/animal-place-thing') {
    return <AnimalPlaceThing />
  }

  if (location.pathname === '/login') {
    return <Login />
  }

  if (location.pathname === '/pending') {
    return <PendingApproval />
  }

  return (
    <HubShell>
      <Routes>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          }
        />
        <Route
          path="/recipes"
          element={
            <ProtectedRoute>
              <Recipes />
            </ProtectedRoute>
          }
        />
        <Route
          path="/import"
          element={
            <ProtectedRoute>
              <ImportRecipes />
            </ProtectedRoute>
          }
        />
        <Route
          path="/planner"
          element={
            <ProtectedRoute>
              <MealPlanner />
            </ProtectedRoute>
          }
        />
        <Route
          path="/shopping"
          element={
            <ProtectedRoute>
              <ShoppingLists />
            </ProtectedRoute>
          }
        />
        <Route
          path="/chores"
          element={
            <ProtectedRoute>
              <Chores />
            </ProtectedRoute>
          }
        />
        <Route
          path="/games"
          element={
            <ProtectedRoute>
              <GamesHub />
            </ProtectedRoute>
          }
        />
        <Route
          path="/games/connect-four"
          element={
            <ProtectedRoute>
              <ConnectFour />
            </ProtectedRoute>
          }
        />
        <Route
          path="/games/hangman"
          element={
            <ProtectedRoute>
              <Hangman />
            </ProtectedRoute>
          }
        />
        <Route
          path="/games/sudoku"
          element={
            <ProtectedRoute>
              <Sudoku />
            </ProtectedRoute>
          }
        />
        <Route
          path="/games/freecell"
          element={
            <ProtectedRoute>
              <Freecell />
            </ProtectedRoute>
          }
        />
        <Route
          path="/games/go-fish"
          element={
            <ProtectedRoute>
              <GoFish />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute requireRole="admin">
              <Admin />
            </ProtectedRoute>
          }
        />
        <Route
          path="/workouts"
          element={
            <ProtectedRoute>
              <WorkoutHub />
            </ProtectedRoute>
          }
        />
        <Route
          path="/workouts/tracker"
          element={
            <ProtectedRoute>
              <WorkoutTracker />
            </ProtectedRoute>
          }
        />
        <Route
          path="/workouts/history"
          element={
            <ProtectedRoute>
              <WorkoutHistory />
            </ProtectedRoute>
          }
        />
      </Routes>
    </HubShell>
  )
}
