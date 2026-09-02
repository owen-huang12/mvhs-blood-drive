import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// iOS Safari has ignored `user-scalable=no` since iOS 10, so the viewport tag
// alone does not stop pinch-zoom there. These gesture events are Safari-only
// (other browsers honour the meta tag and never fire them).
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
