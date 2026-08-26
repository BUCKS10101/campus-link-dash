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

// jsdom doesn't implement scrollIntoView either - cmdk (the Where
// filter's campus-location search list) calls it on the active item
// whenever the list re-renders.
if (typeof Element !== 'undefined' && typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => {}
}

// jsdom doesn't implement matchMedia either - useIsMobile() (Home's
// Where filter, desktop-vs-mobile) needs it just to mount. Always
// reports "not mobile" (matches: false) so component tests exercise the
// desktop (Popover) path by default; a test that needs the mobile (Sheet)
// path overrides this per-test.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList
}
