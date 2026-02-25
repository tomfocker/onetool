import './index.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { FileDropover } from './components/FileDropover'
import { ThemeProvider } from '@/context/ThemeContext'

const hash = window.location.hash.slice(1)
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement)

if (hash === '/floatball') {
  root.render(
    <React.StrictMode>
      <ThemeProvider>
        <div className="w-screen h-screen overflow-hidden">
          <FileDropover />
        </div>
      </ThemeProvider>
    </React.StrictMode>
  )
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}
