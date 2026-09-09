import { Routes, Route } from 'react-router-dom'
import Nav from './components/Nav.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Home from './pages/Home.jsx'
import Login from './pages/Login.jsx'
import PendingApproval from './pages/PendingApproval.jsx'
import Admin from './pages/Admin.jsx'
import Recipes from './pages/Recipes.jsx'
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

export default function App() {
  return (
    <div className="app-shell">
      <Nav />
      <div className="main-content">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/pending" element={<PendingApproval />} />
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
          {/* Not behind ProtectedRoute on purpose: this game is playable by
              anyone with the code, hub account or not (see AnimalPlaceThing.jsx). */}
          <Route path="/games/animal-place-thing" element={<AnimalPlaceThing />} />
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
      </div>
    </div>
  )
}
