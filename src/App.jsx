import { Routes, Route } from 'react-router-dom'
import Nav from './components/Nav.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Home from './pages/Home.jsx'
import Login from './pages/Login.jsx'
import PendingApproval from './pages/PendingApproval.jsx'
import Admin from './pages/Admin.jsx'
import Recipes from './pages/Recipes.jsx'
import Games from './pages/Games.jsx'
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
                <Games />
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
      </div>
    </div>
  )
}
