import './index.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { resolveBootstrapRoute } from './bootstrapRoute'

const hash = window.location.hash
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement)
const bootstrapRoute = resolveBootstrapRoute(hash)

function applyTransparentWindowBackground() {
  // Override body and html background for transparent window
  document.documentElement.style.background = 'transparent'
  document.documentElement.style.backgroundColor = 'transparent'
  document.body.style.background = 'transparent'
  document.body.style.backgroundColor = 'transparent'
}

async function bootstrap() {
  if (bootstrapRoute === 'floatball') {
    applyTransparentWindowBackground()
    const { FileDropover } = await import('./components/FileDropover')
    root.render(
      <React.StrictMode>
        <div className="w-screen h-screen overflow-hidden bg-transparent">
          <FileDropover />
        </div>
      </React.StrictMode>
    )
    return
  }

  if (bootstrapRoute === 'screen-overlay') {
    applyTransparentWindowBackground()
    const { ScreenOverlay } = await import('./components/ScreenOverlay')
    root.render(
      <React.StrictMode>
        <ScreenOverlay />
      </React.StrictMode>
    )
    return
  }

  if (bootstrapRoute === 'color-picker-overlay') {
    applyTransparentWindowBackground()
    const { ColorPickerOverlay } = await import('./components/ColorPickerOverlay')
    root.render(
      <React.StrictMode>
        <ColorPickerOverlay />
      </React.StrictMode>
    )
    return
  }

  if (bootstrapRoute === 'recorder-selection') {
    applyTransparentWindowBackground()
    const module = await import('./components/RecorderSelectionOverlay')
    root.render(
      <React.StrictMode>
        <module.RecorderSelectionOverlay />
      </React.StrictMode>
    )
    return
  }

  if (bootstrapRoute === 'screenshot-selection') {
    applyTransparentWindowBackground()
    const module = await import('./components/ScreenshotSelectionOverlay')
    root.render(
      <React.StrictMode>
        <module.ScreenshotSelectionOverlay />
      </React.StrictMode>
    )
    return
  }

  const { default: App } = await import('./App')
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

void bootstrap()
