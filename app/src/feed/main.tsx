import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './feed.css'
import { Feed } from './Feed'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Feed />
  </StrictMode>,
)
