import { render } from 'preact'
import { registerSW } from 'virtual:pwa-register'
import { App } from './app'
import './estilos.css'

// Registra el service worker. Con registerType 'prompt' una versión nueva
// nunca se activa sola: queda en espera hasta que el usuario la acepte
// desde Ajustes (se implementa en la fase 8).
registerSW({ immediate: true })

// Pide almacenamiento persistente para que el navegador no borre los datos.
if (navigator.storage?.persist) {
  void navigator.storage.persist()
}

render(<App />, document.getElementById('app')!)
