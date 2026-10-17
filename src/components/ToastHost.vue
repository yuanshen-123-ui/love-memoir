<script setup>
/**
 * 全局提示层。放在 App 根部挂一次就够。
 * pointer-events: none —— 提示不能挡住下面的操作。
 */
import { toastState } from '../composables/useToast.js'
</script>

<template>
  <div class="toast-host" aria-live="polite" aria-atomic="true">
    <TransitionGroup name="toast">
      <div v-for="t in toastState.items" :key="t.id" class="toast glass">{{ t.message }}</div>
    </TransitionGroup>
  </div>
</template>
