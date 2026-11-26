/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module 'sql.js/dist/sql-wasm-inline.js' {
  const initSqlJs: () => Promise<unknown>;
  export default initSqlJs;
}
