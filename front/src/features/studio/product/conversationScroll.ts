import type { Ref } from 'vue'
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

// Content growth is not a user scroll. Only explicit upward interaction pauses following.
export function useConversationScroll(viewport: Ref<HTMLElement | undefined>, content: Ref<HTMLElement | undefined>) {
  const following = ref(true)
  let frame = 0
  let resize: ResizeObserver | undefined
  let touchY = 0
  let draggingScrollbar = false
  let previousTop = 0
  function schedule() {
    if (!following.value)
      return
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      if (following.value && viewport.value) {
        viewport.value.scrollTop = viewport.value.scrollHeight
        previousTop = viewport.value.scrollTop
      }
    })
  }
  async function latest() {
    following.value = true
    await nextTick()
    schedule()
  }
  function scroll() {
    const element = viewport.value
    if (!element)
      return
    if (draggingScrollbar && element.scrollTop < previousTop)
      following.value = false
    if (element.scrollHeight - element.scrollTop - element.clientHeight < 24)
      following.value = true
    previousTop = element.scrollTop
  }
  function wheel(event: WheelEvent) {
    if (event.deltaY < 0)
      following.value = false
  }
  function key(event: KeyboardEvent) {
    const editing = event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable]')
    if (['ArrowUp', 'PageUp', 'Home'].includes(event.key) && !editing)
      following.value = false
  }
  function touchStart(event: TouchEvent) {
    touchY = event.touches[0]?.clientY || 0
  }
  function touchMove(event: TouchEvent) {
    const next = event.touches[0]?.clientY || 0
    if (next > touchY + 2)
      following.value = false
    touchY = next
  }
  function pointerDown(event: PointerEvent) {
    const element = viewport.value
    if (element) {
      const rect = element.getBoundingClientRect()
      draggingScrollbar = event.clientX >= rect.right - Math.max(16, element.offsetWidth - element.clientWidth)
      previousTop = element.scrollTop
    }
  }
  function pointerUp() {
    draggingScrollbar = false
  }
  watch([viewport, content], ([element, body]) => {
    resize?.disconnect()
    resize = new ResizeObserver(schedule)
    if (element)
      resize.observe(element)
    if (body)
      resize.observe(body)
    schedule()
  }, { flush: 'post' })
  onBeforeUnmount(() => {
    resize?.disconnect()
    cancelAnimationFrame(frame)
  })
  return { following, latest, schedule, scroll, wheel, key, touchStart, touchMove, pointerDown, pointerUp }
}
