/**
 * Slash-command symbol library — extracted from prototype.js.
 *
 * Used by the SmartText component: when the user types `/foo` in a
 * text or heading block, an autocomplete dropdown surfaces matching
 * symbol keys. Selecting one replaces `/foo` with the symbol value.
 *
 * Stats shortcuts use Unicode mathematical italic characters
 * (e.g. 𝑝 = U+1D45D) so equations look right inline without LaTeX.
 */
export const SYMBOLS: Record<string, string> = {
  // Greek lowercase
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ',
  eta: 'η', theta: 'θ', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν',
  xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ',
  chi: 'χ', psi: 'ψ', omega: 'ω',

  // Greek uppercase
  Alpha: 'Α', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ',
  Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',

  // Math operators
  pm: '±', times: '×', div: '÷', cdot: '·', leq: '≤', geq: '≥',
  neq: '≠', approx: '≈', inf: '∞', deg: '°', sqrt: '√', sum: '∑',
  int: '∫', partial: '∂', nabla: '∇',

  // Arrows
  arrow: '→', larrow: '←', darrow: '↓', uarrow: '↑', iff: '⇔',

  // Stats shortcuts (mathematical italic)
  eta2: 'η²', chi2: 'χ²', R2: 'R²',
  p: '𝑝', F: '𝐹', t: '𝑡', d: '𝑑', r: '𝑟', N: '𝑁', M: '𝑀',
  SD: 'SD', SE: 'SE', CI: 'CI', df: '𝑑𝑓', ns: 'n.s.',
};

export type SymbolKey = keyof typeof SYMBOLS;

/** Returns up to `limit` symbol entries whose key starts with `prefix`. */
export function filterSymbols(prefix: string, limit = 8): Array<[string, string]> {
  return Object.entries(SYMBOLS)
    .filter(([k]) => k.startsWith(prefix))
    .slice(0, limit);
}
