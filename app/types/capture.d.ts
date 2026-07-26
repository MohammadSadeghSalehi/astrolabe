export {};

declare global {
  interface Window {
    __astroReady?: boolean;
  }
}
