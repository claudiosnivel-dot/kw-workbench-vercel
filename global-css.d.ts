// TypeScript 6 verifica gli import a solo effetto collaterale (noUncheckedSideEffectImports).
// next 15 dichiara solo i CSS module: questo file si rimuove con Next 16 (T-404), che dichiara '*.css'.
declare module "*.css";
