import './index.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { FileDropover } from './components/FileDropover'

const hash = window.location.hash.slice(1)
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement)

if (hash === '/floatball' || hash === '/float-ball') {
  // Override body and html background for transparent window
  document.documentElement.style.background = 'transparent';
  document.documentElement.style.backgroundColor = 'transparent';
  document.body.style.background = 'transparent';
  document.body.style.backgroundColor = 'transparent';

  root.render(
    <React.StrictMode>
      <div className="w-screen h-screen overflow-hidden bg-transparent">
        <FileDropover />
      </div>
    </React.StrictMode>
  )
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}
