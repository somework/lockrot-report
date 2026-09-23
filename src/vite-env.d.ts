// Lets TypeScript accept the side-effect `import "./x.css"` each component makes: Vite bundles the
// stylesheet, and this reference declares the module shape tsc otherwise reports as missing.
/// <reference types="vite/client" />
