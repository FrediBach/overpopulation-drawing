import '@testing-library/jest-dom/vitest'

// jsdom lacks a few browser APIs that Radix UI and the app use.
if (typeof window !== 'undefined') {
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  URL.createObjectURL ??= () => 'blob:mock'
  URL.revokeObjectURL ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
  Element.prototype.hasPointerCapture ??= () => false
}
