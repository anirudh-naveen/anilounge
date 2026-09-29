<!--
  FriendButton.vue — friend request controls for another user (component).

  Shows the action that fits the current relationship: add, cancel a sent
  request, accept or decline an incoming one, or unfriend. Emits the new
  relationship so the parent can keep its list in step.
-->
<template>
  <!-- Actions -->
  <div class="friend-button" :data-testid="`friend-button-${relationship}`">
    <!-- Title: Add -->
    <button
      v-if="relationship === 'none'"
      type="button"
      class="btn btn-primary btn-small"
      :disabled="busy"
      data-testid="friend-add"
      @click="send"
    >
      Add friend
    </button>

    <!-- Title: Sent -->
    <button
      v-else-if="relationship === 'outgoing'"
      type="button"
      class="btn btn-ghost btn-small"
      :disabled="busy"
      title="Cancel request"
      data-testid="friend-cancel"
      @click="remove('Cancel your friend request?')"
    >
      Request sent
    </button>

    <!-- Title: Respond -->
    <template v-else-if="relationship === 'incoming'">
      <button
        type="button"
        class="btn btn-primary btn-small"
        :disabled="busy"
        data-testid="friend-accept"
        @click="accept"
      >
        Accept
      </button>
      <button
        type="button"
        class="btn btn-ghost btn-small"
        :disabled="busy"
        data-testid="friend-decline"
        @click="remove()"
      >
        Decline
      </button>
    </template>

    <!-- Title: Friends -->
    <button
      v-else
      type="button"
      class="btn btn-ghost btn-small"
      :disabled="busy"
      title="Remove friend"
      data-testid="friend-remove"
      @click="remove(`Remove ${username} from your friends?`)"
    >
      Friends ✓
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useToast } from 'vue-toastification'
import { friendsAPI } from '@/services/api'
import type { Relationship } from '@/types/social'
import { apiErrorMessage } from '@/utils/social'

const props = defineProps<{
  userId: string
  username: string
  relationship: Relationship
}>()

const emit = defineEmits<{
  'update:relationship': [value: Relationship]
}>()

const toast = useToast()
const busy = ref(false)

const run = async (action: () => Promise<Relationship>, fallback: string) => {
  busy.value = true
  try {
    emit('update:relationship', await action())
  } catch (error) {
    toast.error(apiErrorMessage(error, fallback))
  } finally {
    busy.value = false
  }
}

const send = () =>
  run(async () => {
    const response = await friendsAPI.sendRequest(props.userId)
    toast.success(response.data.message)
    return response.data.data.relationship as Relationship
  }, 'Could not send the friend request.')

const accept = () =>
  run(async () => {
    await friendsAPI.accept(props.userId)
    toast.success(`You and ${props.username} are now friends.`)
    return 'friends'
  }, 'Could not accept the request.')

const remove = (confirmText?: string) => {
  if (confirmText && !confirm(confirmText)) return
  return run(async () => {
    await friendsAPI.remove(props.userId)
    return 'none'
  }, 'Could not update the friendship.')
}
</script>

<style scoped>
.friend-button {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
</style>
