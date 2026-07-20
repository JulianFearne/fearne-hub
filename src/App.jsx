import { Routes, Route } from 'react-router-dom'
import Nav from './components/Nav.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Home from './pages/Home.jsx'
import Login from './pages/Login.jsx'
import Workouts from './pages/Workouts.jsx'
import Recipes from './pages/Recipes.jsx'
import Games from './pages/Games.jsx'
import ImportRecipes from './pages/ImportRecipes.jsx'

export default function App() {
  return (
    <div className="app-shell">
      <Nav />
      <div className="main-content">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            }
          />
          <Route
            path="/workouts"
            element={
              <ProtectedRoute>
                <Workouts />
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
            path="/games"
            element={
              <ProtectedRoute>
                <Games />
              </ProtectedRoute>
            }
          />
        </Routes>
      </div>
    </div>
  )
}
