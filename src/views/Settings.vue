<!--
  Settings.vue — account settings view.

  Edit username, email, profile picture, favorite genres/studios, and
  password; choose optional emails and whether to allow profanity in private
  messages (Communication). Appearance, Email, and Communication changes are
  staged and only applied with each section's Save button. The shared demo account cannot change its password.
  Profile-picture crop happens in a modal overlay.
-->
<template>
  <div class="settings-page">
    <div class="container">
      <!-- Page Header -->
      <div class="page-header">
        <h1>Settings</h1>
        <p>Customize your experience</p>
      </div>

      <div class="settings-content">
        <!-- Account -->
        <div class="settings-section">
          <h2>Account Settings</h2>
          <div class="settings-card">
            <!-- Title: Username -->
            <div class="setting-item">
              <div class="setting-info">
                <h3>Username</h3>
                <p v-if="authStore.isDemoUser">Locked for the demo account</p>
                <p v-else>3-20 letters, numbers, dots, dashes, or underscores</p>
              </div>
              <div v-if="authStore.isDemoUser" class="setting-control">
                <p class="demo-restriction">The shared demo account's username cannot change.</p>
              </div>
              <div v-else class="setting-control">
                <input
                  v-model="username"
                  type="text"
                  class="form-input"
                  placeholder="Enter new username"
                />
                <button
                  @click="updateUsername"
                  class="btn btn-primary"
                  :disabled="!username || username === authStore.user?.username"
                >
                  Update
                </button>
              </div>
            </div>

            <!-- Title: Email -->
            <div class="setting-item">
              <div class="setting-info">
                <h3>Email</h3>
                <p v-if="authStore.isDemoUser">Locked for the demo account</p>
                <p v-else>We'll send a code to the new address to verify it</p>
              </div>
              <div v-if="authStore.isDemoUser" class="setting-control">
                <p class="demo-restriction">The shared demo account's email cannot change.</p>
              </div>
              <div v-else class="setting-control">
                <input
                  v-model="email"
                  type="email"
                  class="form-input"
                  placeholder="Enter new email"
                />
                <input
                  v-if="emailChanged"
                  v-model="emailPassword"
                  type="password"
                  class="form-input"
                  placeholder="Current password"
                  autocomplete="current-password"
                  data-testid="email-change-password"
                />
                <button
                  @click="updateEmail"
                  class="btn btn-primary"
                  :disabled="!emailChanged || !emailPassword"
                >
                  Update
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Appearance -->
        <div class="settings-section">
          <h2>Appearance</h2>
          <div class="settings-card">
            <!-- Title: Theme -->
            <div class="setting-item">
              <div class="setting-info">
                <h3>Theme</h3>
                <p>Pick one to preview it; Save keeps it</p>
              </div>
              <div class="setting-control">
                <div class="theme-options" role="radiogroup" aria-label="Theme">
                  <button
                    v-for="option in THEME_OPTIONS"
                    :key="option.value"
                    type="button"
                    role="radio"
                    class="theme-option"
                    :class="{ selected: themeDraft === option.value }"
                    :aria-checked="themeDraft === option.value"
                    :data-testid="`theme-${option.value}`"
                    @click="themeDraft = option.value"
                  >
                    {{ option.label }}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <SettingsSaveBar
            :dirty="themeDirty"
            testid="save-appearance"
            @save="saveTheme"
            @discard="themeDraft = themePreference"
          />
        </div>

        <!-- Email -->
        <div id="email" class="settings-section">
          <h2>Email</h2>
          <div class="settings-card">
            <!-- Title: Optional Emails -->
            <div v-for="option in EMAIL_OPTIONS" :key="option.key" class="setting-item">
              <div class="setting-info">
                <h3>{{ option.title }}</h3>
                <p>{{ option.description }}</p>
              </div>
              <div class="setting-control">
                <label class="email-toggle">
                  <input
                    v-model="emailDraft[option.key]"
                    type="checkbox"
                    :disabled="!emailPreferences || emailSaving"
                    :data-testid="`email-pref-${option.key}`"
                  />
                  <span>{{ emailDraft[option.key] ? 'On' : 'Off' }}</span>
                </label>
              </div>
            </div>

            <!-- Title: Account Emails -->
            <div class="setting-item">
              <div class="setting-info">
                <h3>Account &amp; security emails</h3>
                <p>Always on</p>
              </div>
              <div class="setting-control">
                <p class="setting-hint">
                  Sign-up and sign-in codes, unlock links, email-change notices, and account
                  deletion warnings always send, since they protect your account.
                </p>
              </div>
            </div>
          </div>
          <SettingsSaveBar
            :dirty="emailDirty"
            :saving="emailSaving"
            testid="save-email"
            @save="saveEmailPreferences"
            @discard="resetEmailDraft"
          />
        </div>

        <!-- Communication -->
        <div id="communication" class="settings-section">
          <h2>Communication</h2>
          <div class="settings-card">
            <!-- Title: Allow Profanity -->
            <div class="setting-item">
              <div class="setting-info">
                <h3>Allow profanity</h3>
                <p>
                  In private messages, curse words go through unfiltered when both you and your
                  friend turn this on. Slurs are always blocked, and public text is always filtered.
                </p>
              </div>
              <div class="setting-control">
                <label class="email-toggle">
                  <input
                    v-model="allowProfanityDraft"
                    type="checkbox"
                    :disabled="!communication || communicationSaving || authStore.isDemoUser"
                    data-testid="allow-profanity"
                  />
                  <span>{{ allowProfanityDraft ? 'On' : 'Off' }}</span>
                </label>
              </div>
            </div>
          </div>
          <SettingsSaveBar
            :dirty="communicationDirty"
            :saving="communicationSaving"
            testid="save-communication"
            @save="saveCommunication"
            @discard="allowProfanityDraft = communication?.allowProfanity ?? false"
          />
        </div>

        <!-- Privacy -->
        <div class="settings-section">
          <h2>Privacy & Security</h2>
          <div class="settings-card">
            <!-- Title: Change Password -->
            <div class="setting-item">
              <div class="setting-info">
                <h3>Change Password</h3>
                <p v-if="authStore.isDemoUser">Disabled for the demo account</p>
                <p v-else>Update your account password</p>
              </div>
              <div v-if="!authStore.isDemoUser" class="setting-control">
                <div class="password-form">
                  <input
                    v-model="currentPassword"
                    type="password"
                    class="form-input"
                    placeholder="Current password"
                  />
                  <input
                    v-model="newPassword"
                    type="password"
                    class="form-input"
                    placeholder="New password"
                  />
                  <input
                    v-model="confirmPassword"
                    type="password"
                    class="form-input"
                    placeholder="Confirm new password"
                  />
                  <button
                    @click="changePassword"
                    class="btn btn-primary"
                    :disabled="!canChangePassword"
                  >
                    Change Password
                  </button>
                </div>
              </div>
              <div v-else class="setting-control">
                <p class="demo-restriction">The shared demo account cannot change its password.</p>
              </div>
            </div>

            <!-- Title: Two-Factor Authentication -->
            <div class="setting-item" data-testid="two-factor">
              <div class="setting-info">
                <h3>Two-Factor Authentication</h3>
                <p v-if="authStore.isDemoUser">Disabled for the demo account</p>
                <p v-else-if="twoFactor.enabled">
                  On · {{ twoFactor.backupCodesRemaining }} backup codes left
                </p>
                <p v-else>Require a code from an authenticator app when you sign in</p>
              </div>

              <div v-if="authStore.isDemoUser" class="setting-control">
                <p class="demo-restriction">The shared demo account cannot use two-factor.</p>
              </div>

              <!-- Backup codes (shown once) -->
              <div v-else-if="twoFactorMode === 'codes'" class="setting-control two-factor-panel">
                <p class="two-factor-note">
                  Save these backup codes somewhere safe. Each works once if you lose your phone.
                  They won't be shown again.
                </p>
                <ul class="backup-codes" data-testid="backup-codes">
                  <li v-for="backupCode in backupCodes" :key="backupCode">{{ backupCode }}</li>
                </ul>
                <div class="delete-actions">
                  <button type="button" class="btn btn-secondary" @click="copyBackupCodes">
                    Copy
                  </button>
                  <button type="button" class="btn btn-primary" @click="finishTwoFactorFlow">
                    I've saved them
                  </button>
                </div>
              </div>

              <!-- Setup -->
              <form
                v-else-if="twoFactorMode === 'setup' && twoFactorSetup"
                class="setting-control two-factor-panel"
                @submit.prevent="enableTwoFactor"
              >
                <p class="two-factor-note">
                  Scan this with Google Authenticator, 1Password, Authy, or a similar app.
                </p>
                <img
                  :src="twoFactorSetup.qrCodeDataUrl"
                  alt="Two-factor QR code"
                  class="two-factor-qr"
                />
                <p class="two-factor-note">
                  Can't scan? Enter this key:
                  <code class="two-factor-secret">{{ twoFactorSetup.secret }}</code>
                </p>
                <input
                  v-model="twoFactorCodeInput"
                  type="text"
                  class="form-input"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  maxlength="6"
                  placeholder="6-digit code from the app"
                  data-testid="two-factor-setup-code"
                />
                <div class="delete-actions">
                  <button type="button" class="btn btn-secondary" @click="finishTwoFactorFlow">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    class="btn btn-primary"
                    :disabled="twoFactorBusy || twoFactorCodeInput.trim().length !== 6"
                  >
                    Turn on
                  </button>
                </div>
              </form>

              <!-- Disable / regenerate -->
              <form
                v-else-if="twoFactorMode === 'disable' || twoFactorMode === 'regenerate'"
                class="setting-control two-factor-panel"
                @submit.prevent="
                  twoFactorMode === 'disable' ? disableTwoFactor() : regenerateCodes()
                "
              >
                <input
                  v-if="twoFactorMode === 'disable'"
                  v-model="twoFactorPassword"
                  type="password"
                  class="form-input"
                  placeholder="Current password"
                  autocomplete="current-password"
                />
                <input
                  v-model="twoFactorCodeInput"
                  type="text"
                  class="form-input"
                  autocomplete="one-time-code"
                  maxlength="9"
                  placeholder="Authenticator or backup code"
                />
                <div class="delete-actions">
                  <button type="button" class="btn btn-secondary" @click="finishTwoFactorFlow">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    :class="['btn', twoFactorMode === 'disable' ? 'btn-danger' : 'btn-primary']"
                    :disabled="
                      twoFactorBusy ||
                      !twoFactorCodeInput.trim() ||
                      (twoFactorMode === 'disable' && !twoFactorPassword)
                    "
                  >
                    {{ twoFactorMode === 'disable' ? 'Turn off' : 'Create new codes' }}
                  </button>
                </div>
              </form>

              <!-- Idle -->
              <div v-else class="setting-control two-factor-actions">
                <template v-if="twoFactor.enabled">
                  <button
                    type="button"
                    class="btn btn-secondary"
                    @click="twoFactorMode = 'regenerate'"
                  >
                    New backup codes
                  </button>
                  <button type="button" class="btn btn-danger" @click="twoFactorMode = 'disable'">
                    Turn off
                  </button>
                </template>
                <button
                  v-else
                  type="button"
                  class="btn btn-primary"
                  :disabled="twoFactorBusy"
                  data-testid="two-factor-start"
                  @click="startTwoFactorSetup"
                >
                  Set up
                </button>
              </div>
            </div>

            <!-- Title: Sessions -->
            <div class="setting-item">
              <div class="setting-info">
                <h3>Signed-in Devices</h3>
                <p>
                  This browser stays signed in for 30 days. Sign out everywhere if you used a shared
                  computer or think someone else has access.
                </p>
              </div>
              <div class="setting-control">
                <button
                  type="button"
                  class="btn btn-secondary"
                  data-testid="sign-out-everywhere"
                  @click="signOutEverywhere"
                >
                  Sign out of all devices
                </button>
              </div>
            </div>

            <!-- Title: Delete Account -->
            <div class="setting-item danger-item" data-testid="delete-account">
              <div class="setting-info">
                <h3>Delete Account</h3>
                <p v-if="authStore.isDemoUser">Disabled for the demo account</p>
                <p v-else>
                  Permanently remove your account, watchlist, ratings, favorites, and profile.
                </p>
              </div>
              <div v-if="authStore.isDemoUser" class="setting-control">
                <p class="demo-restriction">The shared demo account cannot be deleted.</p>
              </div>
              <div v-else-if="!showDeleteConfirm" class="setting-control">
                <button
                  class="btn btn-danger"
                  data-testid="delete-account-start"
                  @click="showDeleteConfirm = true"
                >
                  Delete Account
                </button>
              </div>
              <form v-else class="setting-control delete-form" @submit.prevent="deleteAccount">
                <p class="delete-warning">This cannot be undone. Enter your password to confirm.</p>
                <input
                  v-model="deletePassword"
                  type="password"
                  class="form-input"
                  placeholder="Current password"
                  autocomplete="current-password"
                  data-testid="delete-account-password"
                />
                <label class="delete-ack">
                  <input
                    v-model="deleteAcknowledged"
                    type="checkbox"
                    data-testid="delete-account-ack"
                  />
                  I understand my account and data will be permanently deleted.
                </label>
                <div class="delete-actions">
                  <button type="button" class="btn btn-secondary" @click="cancelDeleteAccount">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    class="btn btn-danger"
                    :disabled="!canDeleteAccount"
                    data-testid="delete-account-confirm"
                  >
                    {{ isDeletingAccount ? 'Deleting...' : 'Delete Permanently' }}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  communicationAPI,
  emailPreferencesAPI,
  securityAPI,
  type CommunicationSettings,
  type EmailPreferences,
} from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { useFavoritesStore } from '@/stores/favorites'
import { useToast } from 'vue-toastification'
import { useTheme, type ThemePreference } from '@/composables/useTheme'
import SettingsSaveBar from '@/components/SettingsSaveBar.vue'
import { usePageTitle } from '@/composables/usePageMeta'

usePageTitle('Settings')

// Component name for Vue devtools
defineOptions({
  name: 'SettingsPage',
})

const authStore = useAuthStore()
const toast = useToast()
const router = useRouter()
const route = useRoute()

// Form data
const username = ref('')
const email = ref('')
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dawn', label: 'Dawn' },
  { value: 'penumbra', label: 'Penumbra' },
  { value: 'dusk', label: 'Dusk' },
  { value: 'dark', label: 'Dark' },
]
const {
  preference: themePreference,
  setPreference: setThemePreference,
  preview: previewTheme,
} = useTheme()
/** Theme as picked; previewed on screen right away, kept when the Appearance section is saved. */
const themeDraft = ref<ThemePreference>(themePreference.value)
const themeDirty = computed(() => themeDraft.value !== themePreference.value)
watch(themeDraft, (theme) => previewTheme(theme))
// Leaving Settings without saving drops the preview.
onUnmounted(() => previewTheme(null))

const saveTheme = () => {
  setThemePreference(themeDraft.value)
  toast.success('Theme saved.')
}

// Computed properties
const canChangePassword = computed(() => {
  return (
    !authStore.isDemoUser &&
    currentPassword.value &&
    newPassword.value &&
    confirmPassword.value &&
    newPassword.value === confirmPassword.value &&
    newPassword.value.length >= 6
  )
})

// Methods
const updateUsername = async () => {
  try {
    await authStore.updateProfile({ username: username.value })
    toast.success('Username updated successfully')
  } catch {
    toast.error(authStore.error || 'Failed to update username')
  }
}

const emailPassword = ref('')
const emailChanged = computed(
  () => Boolean(email.value) && email.value.trim().toLowerCase() !== authStore.user?.email,
)

const updateEmail = async () => {
  try {
    const result = await authStore.updateProfile({
      email: email.value,
      currentPassword: emailPassword.value,
    })
    emailPassword.value = ''
    if (result?.data?.emailVerificationSent) {
      toast.success('Email updated. Enter the code we sent to verify it.')
      router.push({ name: 'verifyEmail', query: { email: authStore.user?.email } })
      return
    }
    toast.success('Email updated successfully')
  } catch {
    toast.error(authStore.error || 'Failed to update email')
  }
}

const signOutEverywhere = async () => {
  if (!confirm('Sign out of AniLounge on every device, including this one?')) return
  try {
    await authStore.signOutEverywhere()
    useFavoritesStore().reset()
    toast.success('Signed out of all devices')
    router.push('/login')
  } catch {
    toast.error('Could not sign out other devices')
  }
}

const changePassword = async () => {
  if (authStore.isDemoUser) {
    toast.error('Password cannot be changed for the demo account')
    return
  }

  try {
    await authStore.changePassword({
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
    })
    toast.success('Password changed successfully')
    // Clear password fields
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  } catch {
    toast.error('Failed to change password')
  }
}

type TwoFactorMode = 'idle' | 'setup' | 'codes' | 'disable' | 'regenerate'

const twoFactor = ref({ enabled: false, backupCodesRemaining: 0 })
const twoFactorMode = ref<TwoFactorMode>('idle')
const twoFactorSetup = ref<{ secret: string; qrCodeDataUrl: string } | null>(null)
const twoFactorCodeInput = ref('')
const twoFactorPassword = ref('')
const twoFactorBusy = ref(false)
const backupCodes = ref<string[]>([])

const apiMessage = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } }).response?.data?.message || fallback

const loadSecurityStatus = async () => {
  if (authStore.isDemoUser) return
  try {
    const response = await securityAPI.getStatus()
    const data = response.data.data
    twoFactor.value = {
      enabled: Boolean(data.twoFactorEnabled),
      backupCodesRemaining: data.backupCodesRemaining || 0,
    }
  } catch (err) {
    console.error('Failed to load security settings:', err)
  }
}

/** Run a 2FA action with the busy flag and a toast on failure. */
const withTwoFactorBusy = async (fallback: string, action: () => Promise<void>) => {
  twoFactorBusy.value = true
  try {
    await action()
  } catch (err) {
    toast.error(apiMessage(err, fallback))
    twoFactorCodeInput.value = ''
  } finally {
    twoFactorBusy.value = false
  }
}

const startTwoFactorSetup = () =>
  withTwoFactorBusy('Could not start setup', async () => {
    const response = await securityAPI.startTwoFactorSetup()
    twoFactorSetup.value = response.data.data
    twoFactorCodeInput.value = ''
    twoFactorMode.value = 'setup'
  })

const enableTwoFactor = () =>
  withTwoFactorBusy('That code did not match', async () => {
    const response = await securityAPI.enableTwoFactor(twoFactorCodeInput.value.trim())
    backupCodes.value = response.data.data.backupCodes
    twoFactor.value = { enabled: true, backupCodesRemaining: backupCodes.value.length }
    twoFactorSetup.value = null
    twoFactorMode.value = 'codes'
    toast.success('Two-factor authentication is on')
  })

const regenerateCodes = () =>
  withTwoFactorBusy('That code is not valid', async () => {
    const response = await securityAPI.newBackupCodes(twoFactorCodeInput.value.trim())
    backupCodes.value = response.data.data.backupCodes
    twoFactor.value.backupCodesRemaining = backupCodes.value.length
    twoFactorMode.value = 'codes'
  })

const disableTwoFactor = () =>
  withTwoFactorBusy('Could not turn off two-factor', async () => {
    await securityAPI.disableTwoFactor(twoFactorPassword.value, twoFactorCodeInput.value.trim())
    twoFactor.value = { enabled: false, backupCodesRemaining: 0 }
    finishTwoFactorFlow()
    toast.success('Two-factor authentication is off')
  })

const copyBackupCodes = async () => {
  try {
    await navigator.clipboard.writeText(backupCodes.value.join('\n'))
    toast.success('Backup codes copied')
  } catch {
    toast.error('Copy failed; write them down instead')
  }
}

const finishTwoFactorFlow = () => {
  twoFactorMode.value = 'idle'
  twoFactorSetup.value = null
  twoFactorCodeInput.value = ''
  twoFactorPassword.value = ''
  backupCodes.value = []
}

const showDeleteConfirm = ref(false)
const deletePassword = ref('')
const deleteAcknowledged = ref(false)
const isDeletingAccount = ref(false)

const canDeleteAccount = computed(
  () =>
    !authStore.isDemoUser &&
    deletePassword.value.length > 0 &&
    deleteAcknowledged.value &&
    !isDeletingAccount.value,
)

const cancelDeleteAccount = () => {
  showDeleteConfirm.value = false
  deletePassword.value = ''
  deleteAcknowledged.value = false
}

const deleteAccount = async () => {
  if (!canDeleteAccount.value) return
  isDeletingAccount.value = true
  try {
    await authStore.deleteAccount(deletePassword.value)
    useFavoritesStore().reset()
    toast.success('Your account has been deleted')
    router.push('/')
  } catch {
    toast.error(authStore.error || 'Failed to delete account')
    deletePassword.value = ''
  } finally {
    isDeletingAccount.value = false
  }
}

const EMAIL_OPTIONS: { key: keyof EmailPreferences; title: string; description: string }[] = [
  {
    key: 'friend_requests',
    title: 'Friend requests',
    description: 'An email when someone sends you a friend request',
  },
  {
    key: 'announcements',
    title: 'Announcements',
    description: 'Occasional news about AniLounge features',
  },
]
const emailPreferences = ref<EmailPreferences | null>(null)
/** Toggles as edited; sent together when the section is saved. */
const emailDraft = ref<EmailPreferences>({ announcements: true, friend_requests: true })
const emailSaving = ref(false)

const resetEmailDraft = () => {
  if (emailPreferences.value) emailDraft.value = { ...emailPreferences.value }
}

const emailDirty = computed(
  () =>
    !!emailPreferences.value &&
    EMAIL_OPTIONS.some(
      (option) => emailDraft.value[option.key] !== (emailPreferences.value?.[option.key] ?? true),
    ),
)

const loadEmailPreferences = async () => {
  try {
    const response = await emailPreferencesAPI.get()
    emailPreferences.value = response.data.data as EmailPreferences
    resetEmailDraft()
  } catch (err) {
    toast.error(apiMessage(err, 'Could not load email preferences.'))
  }
}

const saveEmailPreferences = async () => {
  if (!emailPreferences.value || !emailDirty.value) return
  const changes: Partial<EmailPreferences> = {}
  for (const option of EMAIL_OPTIONS) {
    if (emailDraft.value[option.key] !== emailPreferences.value[option.key]) {
      changes[option.key] = emailDraft.value[option.key]
    }
  }
  emailSaving.value = true
  try {
    const response = await emailPreferencesAPI.update(changes)
    emailPreferences.value = response.data.data as EmailPreferences
    resetEmailDraft()
    toast.success('Email preferences saved.')
  } catch (err) {
    toast.error(apiMessage(err, 'Could not save email preferences.'))
  } finally {
    emailSaving.value = false
  }
}

const communication = ref<CommunicationSettings | null>(null)
const allowProfanityDraft = ref(false)
const communicationSaving = ref(false)

const communicationDirty = computed(
  () => !!communication.value && allowProfanityDraft.value !== communication.value.allowProfanity,
)

const loadCommunication = async () => {
  try {
    const response = await communicationAPI.get()
    communication.value = response.data.data as CommunicationSettings
    allowProfanityDraft.value = communication.value.allowProfanity
  } catch (err) {
    toast.error(apiMessage(err, 'Could not load communication settings.'))
  }
}

const saveCommunication = async () => {
  if (!communicationDirty.value) return
  const allowProfanity = allowProfanityDraft.value
  communicationSaving.value = true
  try {
    const response = await communicationAPI.update({ allowProfanity })
    communication.value = response.data.data as CommunicationSettings
    allowProfanityDraft.value = communication.value.allowProfanity
    toast.success(
      allowProfanity
        ? 'Profanity allowed in private messages with friends who also allow it.'
        : 'Profanity filtered in your private messages.',
    )
  } catch (err) {
    toast.error(apiMessage(err, 'Could not save communication settings.'))
  } finally {
    communicationSaving.value = false
  }
}

// Initialize form data
onMounted(() => {
  username.value = authStore.user?.username || ''
  email.value = authStore.user?.email || ''
  loadSecurityStatus()
  loadEmailPreferences()
  loadCommunication()
  // Email footers link to /settings#email.
  if (route.hash === '#email') {
    nextTick(() => document.getElementById('email')?.scrollIntoView({ behavior: 'smooth' }))
  }
})
</script>

<style scoped>
.settings-page {
  padding: 2rem 0;
  min-height: calc(100vh - 140px);
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1rem;
}

.page-header {
  text-align: center;
  margin-bottom: 3rem;
}

.page-header h1 {
  font-family: var(--font-display);
  font-size: 2.5rem;
  font-weight: 650;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
  letter-spacing: -0.03em;
}

.page-header p {
  font-size: 1.1rem;
  color: var(--text-secondary);
}

.settings-content {
  display: grid;
  gap: 2rem;
}

.settings-section h2 {
  font-size: 1.8rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 1rem;
}

.settings-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 2rem;
  box-shadow: var(--shadow-sm);
}

.setting-item {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 2rem;
  padding: 1.5rem 0;
  border-bottom: 1px solid var(--border-subtle);
}

.setting-item:last-child {
  border-bottom: none;
}

.setting-info h3 {
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.setting-info p {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.setting-control {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.email-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
}

.email-toggle input {
  width: 1.15rem;
  height: 1.15rem;
  accent-color: var(--coral-primary);
  cursor: pointer;
}

.form-input {
  padding: 0.75rem;
  border: 2px solid var(--border-color);
  border-radius: 8px;
  font-size: 1rem;
  background: var(--bg-parchment);
  color: var(--text-primary);
}

.form-input:focus {
  outline: none;
  border-color: var(--coral-primary);
  box-shadow: 0 0 0 3px rgba(224, 122, 95, 0.2);
  background: var(--bg-parchment);
}

.form-input::placeholder {
  color: var(--text-muted);
}

.btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  line-height: 1.15;
  gap: 0.5rem;
}

.btn-primary {
  background: var(--blend-color);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--coral-primary);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.btn-primary:disabled {
  background: var(--text-muted);
  cursor: not-allowed;
  opacity: 0.6;
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover {
  background: #5a6268;
}

.password-form {
  display: grid;
  gap: 1rem;
}

.demo-restriction {
  color: var(--text-secondary);
  font-size: 0.9rem;
  margin: 0;
  padding: 0.75rem 0;
}

.two-factor-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.two-factor-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.two-factor-note {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.two-factor-qr {
  width: 180px;
  height: 180px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: #fff;
}

.two-factor-secret {
  display: inline-block;
  margin-top: 0.25rem;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  background: var(--bg-secondary);
  font-size: 0.85rem;
  word-break: break-all;
}

.backup-codes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.4rem;
  margin: 0;
  padding: 0.75rem;
  border-radius: 8px;
  background: var(--bg-secondary);
  font-family: monospace;
  font-size: 0.95rem;
  list-style: none;
}

.theme-options {
  display: inline-flex;
  flex-wrap: wrap;
  padding: 0.25rem;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-secondary);
}

.theme-option {
  padding: 0.45rem 1rem;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-weight: 600;
  cursor: pointer;
}

.theme-option.selected {
  background: var(--bg-card);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
}

.setting-hint {
  margin: 0.75rem 0 0;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.danger-item .setting-info h3 {
  color: #c0392b;
}

.delete-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.delete-warning {
  margin: 0;
  color: #c0392b;
  font-weight: 600;
}

.delete-ack {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.delete-ack input {
  margin-top: 0.2rem;
}

.delete-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

@media (max-width: 768px) {
  .setting-item {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
}

.btn-secondary {
  background: var(--teal-primary);
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: var(--teal-light);
}

.btn-danger {
  background: #e74c3c;
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #c0392b;
}
</style>
