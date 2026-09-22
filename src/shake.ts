/** Briefly shakes an element to draw attention to it - e.g. Start Audio when the user tries to play before unlocking sound. Safe to call repeatedly/rapidly; restarts the animation each time rather than stacking. */
export function shake(el: HTMLElement): void {
  el.classList.remove('shake')
  void el.offsetWidth // force reflow so re-adding the class restarts the animation
  el.classList.add('shake')
  el.addEventListener('animationend', () => el.classList.remove('shake'), { once: true })
}
