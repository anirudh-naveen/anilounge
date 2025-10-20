import { createApp } from 'vue'
import { createPinia } from 'pinia'
import Toast from 'vue-toastification'
import 'vue-toastification/dist/index.css'

import App from './App.vue'
import router from './router'
import './assets/styles/global.css'
import { useAuthStore } from './stores/auth'
import { useContentStore } from './stores/content'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(Toast, {
  position: 'top-right',
  timeout: 3000,
  closeOnClick: true,
  pauseOnFocusLoss: true,
  pauseOnHover: true,
  draggable: true,
  draggablePercent: 0.6,
  showCloseButtonOnHover: false,
  hideProgressBar: false,
  closeButton: 'button',
  icon: true,
  rtl: false,
})

// Initialize authentication and content after Pinia is set up
const authStore = useAuthStore()
const contentStore = useContentStore()

authStore.initAuth()

// Load watchlist and refresh user data if user is authenticated
if (authStore.isAuthenticated) {
  contentStore.loadWatchlist()
  authStore.loadUser() // Refresh user data to get updated creation date
}

app.mount('#app')
