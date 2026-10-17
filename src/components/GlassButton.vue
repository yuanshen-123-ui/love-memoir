<script setup>
/**
 * 通用按钮。
 * 样式全在 style.css 的 .btn 里（全局复用，避免每个组件重复写一遍玻璃参数）。
 * 这里只做变体开关，注意：没有 hover 样式，只有 :active 按压 —— 手机上没有鼠标。
 */
defineProps({
  /** solid = 渐变主按钮；ghost = 玻璃次按钮 */
  variant: { type: String, default: 'solid' },
  /** 撑满整行 */
  block: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  /** md（54px 高，主操作） / sm（42px 高，次要操作） */
  size: { type: String, default: 'md' },
})
</script>

<template>
  <button
    type="button"
    class="btn"
    :class="[`btn--${variant}`, { 'btn--block': block, 'btn--sm': size === 'sm' }]"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>
