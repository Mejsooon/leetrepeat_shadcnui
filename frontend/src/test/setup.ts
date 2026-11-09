import "@testing-library/jest-dom/vitest"

// Recharts (wykresy) mierzy kontener przez ResizeObserver — jsdom go nie ma
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver
