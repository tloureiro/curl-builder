import "@testing-library/jest-dom/vitest";

// jsdom lacks dialog methods. Real modality/keyboard behavior is checked in Electron.
if (typeof HTMLDialogElement !== "undefined") Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: { configurable: true, value(this: HTMLDialogElement) { this.open = true; } },
  close: { configurable: true, value(this: HTMLDialogElement) { this.open = false; } },
});
