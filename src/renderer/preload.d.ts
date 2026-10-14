import { PreloadApi } from "../preload/preload";

declare global {
  interface Window {
    shell: PreloadApi;
  }
}
export {};
