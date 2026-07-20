import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import './styles/global.css'

// Second half of the GitHub Pages SPA routing workaround (see public/404.html).
// If we arrived here via the 404 redirect, the real path is hiding in the
// query string as "?/path" -- decode it back into a normal URL before React
// Router ever sees it, using replaceState so it doesn't add a history entry.
;(function decodeRedirectedPath() {
  const { pathname, search, hash } = window.location
  if (search[1] === '/') {
    const decoded =
      search
        .slice(1)
        .split('&')
        .map((s) => s.replace(/~and~/g, '&'))
        .join('?')
    window.history.replaceState(null, '', pathname.slice(0, -1) + decoded + hash)
  }
})()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
