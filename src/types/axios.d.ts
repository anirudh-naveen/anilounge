/**
 * axios.d.ts — request config flags used by the session refresh interceptor in `services/api.ts`.
 */
import 'axios'

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Do not try a cookie refresh when this request gets a 401. */
    skipAuthRefresh?: boolean
    /** Set on the one replay after a successful refresh. */
    retriedAfterRefresh?: boolean
  }
}
