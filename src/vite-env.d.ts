/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Injected at build time (see vite.config.ts); falls back to '1.0.0' in the UI. */
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
