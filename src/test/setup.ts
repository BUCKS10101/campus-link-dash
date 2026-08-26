import '@testing-library/jest-dom/vitest'

// jsdom doesn't implement ResizeObserver - Radix primitives that measure
// their own size (Slider, among others) need it just to mount.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
