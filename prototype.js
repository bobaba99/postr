import { useState, useRef, useCallback, useEffect, useMemo } from "react";

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════
const POSTER_SIZES = {
  "48×36": { w: 48, h: 36, label: '48"×36" Landscape' }, "36×48": { w: 36, h: 48, label: '36"×48" Portrait' },
  "42×36": { w: 42, h: 36, label: '42"×36" Landscape' }, "36×42": { w: 36, h: 42, label: '36"×42" Portrait' },
  "42×42": { w: 42, h: 42, label: '42"×42" Square' }, "24×36": { w: 24, h: 36, label: '24"×36" Small' },
  A0L: { w: 46.8, h: 33.1, label: "A0 Landscape" }, A0P: { w: 33.1, h: 46.8, label: "A0 Portrait" },
};
const FONTS = {
  "Source Sans 3": { css: "'Source Sans 3',sans-serif", cat: "sans" }, "DM Sans": { css: "'DM Sans',sans-serif", cat: "sans" },
  "IBM Plex Sans": { css: "'IBM Plex Sans',sans-serif", cat: "sans" }, "Fira Sans": { css: "'Fira Sans',sans-serif", cat: "sans" },
  "Libre Franklin": { css: "'Libre Franklin',sans-serif", cat: "sans" }, Outfit: { css: "'Outfit',sans-serif", cat: "sans" },
  Charter: { css: "'Charter','Palatino',serif", cat: "serif" }, Literata: { css: "'Literata',serif", cat: "serif" },
  "Source Serif 4": { css: "'Source Serif 4',serif", cat: "serif" }, Lora: { css: "'Lora',serif", cat: "serif" },
};
const PALETTES = [
  { name: "Classic Academic", bg: "#FFFFFF", primary: "#1a1a2e", accent: "#0f4c75", accent2: "#3282b8", muted: "#6c757d", headerBg: "#0f4c75", headerFg: "#fff" },
  { name: "Nature / Biology", bg: "#FAFDF7", primary: "#1b3a2d", accent: "#2d6a4f", accent2: "#52b788", muted: "#5a6e5f", headerBg: "#2d6a4f", headerFg: "#fff" },
  { name: "Medical / Clinical", bg: "#F8FAFF", primary: "#0d1b2a", accent: "#1b4965", accent2: "#62b6cb", muted: "#5c6b7a", headerBg: "#1b4965", headerFg: "#fff" },
  { name: "Engineering", bg: "#FAFAFA", primary: "#212529", accent: "#c1121f", accent2: "#e36414", muted: "#6c757d", headerBg: "#c1121f", headerFg: "#fff" },
  { name: "Psychology / Neuro", bg: "#FAF8FF", primary: "#1a1030", accent: "#5b3a8c", accent2: "#9b72cf", muted: "#6e6480", headerBg: "#5b3a8c", headerFg: "#fff" },
  { name: "Humanities / Arts", bg: "#FDF8F3", primary: "#2b2118", accent: "#7b2d26", accent2: "#c07a52", muted: "#7a6b5d", headerBg: "#7b2d26", headerFg: "#fff" },
  { name: "Earth Sciences", bg: "#F8F6F0", primary: "#2c2416", accent: "#8B6914", accent2: "#b8860b", muted: "#7a7060", headerBg: "#5c4a10", headerFg: "#fff" },
  { name: "Clean Minimal", bg: "#FFFFFF", primary: "#111111", accent: "#333333", accent2: "#666666", muted: "#999999", headerBg: "#111111", headerFg: "#fff" },
];
const PX = 10;
const DEF_STYLES = { title: { size: 24, weight: 800, italic: false, lineHeight: 1.15, color: null, highlight: null },
  authors: { size: 11, weight: 400, italic: false, lineHeight: 1.5, color: null, highlight: null },
  heading: { size: 13, weight: 700, italic: false, lineHeight: 1.3, color: null, highlight: null },
  body: { size: 9, weight: 400, italic: false, lineHeight: 1.55, color: null, highlight: null } };
const DEF_HEADING = { showNumber: false, borderStyle: "bottom", useBgFill: false, textAlign: "left" };
const TB_PRESETS = {
  none: { n: "None", hL: 0, vL: 0, oB: 0, hdrL: 0, topL: 0, botL: 0, hBox: 0 },
  "apa": { n: "APA 3-Line", hL: 0, vL: 0, oB: 0, hdrL: 1, topL: 1, botL: 1, hBox: 0 },
  "all": { n: "All Lines", hL: 1, vL: 1, oB: 1, hdrL: 1, topL: 0, botL: 0, hBox: 0 },
  "honly": { n: "H-Lines", hL: 1, vL: 0, oB: 0, hdrL: 1, topL: 0, botL: 0, hBox: 0 },
  "hbox": { n: "Header Box", hL: 0, vL: 0, oB: 0, hdrL: 1, topL: 0, botL: 0, hBox: 1 },
};

// ── Slash commands ─────────────────────────────────────────────────
const SYMS = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", zeta: "ζ", eta: "η", theta: "θ",
  kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ",
  phi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Alpha: "Α", Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  pm: "±", times: "×", div: "÷", cdot: "·", leq: "≤", geq: "≥", neq: "≠", approx: "≈", inf: "∞",
  deg: "°", sqrt: "√", sum: "∑", int: "∫", partial: "∂", nabla: "∇",
  arrow: "→", larrow: "←", darrow: "↓", uarrow: "↑", iff: "⇔",
  eta2: "η²", chi2: "χ²", R2: "R²", p: "𝑝", F: "𝐹", t: "𝑡", d: "𝑑", r: "𝑟", N: "𝑁", M: "𝑀",
  SD: "SD", SE: "SE", CI: "CI", df: "𝑑𝑓", ns: "n.s.",
};

// ── Citation styles ────────────────────────────────────────────────
const CIT_STYLES = {
  "APA 7": (r, i) => { const a = fmtAuthorsAPA(r.authors); return `${a} (${r.year || "n.d."}). ${r.title}. ${r.journal ? `_${r.journal}_.` : ""}`; },
  Vancouver: (r, i) => { const a = r.authors.slice(0, 3).map(x => x.split(",")[0]).join(", ") + (r.authors.length > 3 ? ", et al" : ""); return `${i + 1}. ${a}. ${r.title}. ${r.journal || ""}. ${r.year || ""}.`; },
  IEEE: (r, i) => { const a = r.authors.slice(0, 3).map(x => { const p = x.split(","); return p.length > 1 ? `${p[1].trim().charAt(0)}. ${p[0].trim()}` : x; }).join(", ") + (r.authors.length > 3 ? ", et al." : ""); return `[${i + 1}] ${a}, "${r.title}," ${r.journal ? `_${r.journal}_` : ""}, ${r.year || ""}.`; },
  Harvard: (r, i) => { const a = fmtAuthorsAPA(r.authors); return `${a} (${r.year || "n.d."}) '${r.title}', ${r.journal ? `_${r.journal}_.` : ""}`; },
};
function fmtAuthorsAPA(authors) {
  if (!authors.length) return "Unknown";
  const fmt = (a) => { const p = a.split(","); return p.length > 1 ? `${p[0].trim()}, ${p[1].trim().split(" ").map(w => w.charAt(0) + ".").join(" ")}` : a; };
  if (authors.length === 1) return fmt(authors[0]);
  if (authors.length === 2) return `${fmt(authors[0])} & ${fmt(authors[1])}`;
  if (authors.length <= 20) return authors.slice(0, -1).map(fmt).join(", ") + ", & " + fmt(authors[authors.length - 1]);
  return fmt(authors[0]) + " et al.";
}
const SORT_MODES = { none: "Manual Order", alpha: "Alphabetical (first author)", year: "Year (newest first)", "year-asc": "Year (oldest first)" };
function sortRefs(refs, mode) {
  if (mode === "none") return refs;
  const s = [...refs];
  if (mode === "alpha") s.sort((a, b) => ((a.authors[0] || "").toLowerCase()).localeCompare((b.authors[0] || "").toLowerCase()));
  if (mode === "year") s.sort((a, b) => (parseInt(b.year) || 0) - (parseInt(a.year) || 0));
  if (mode === "year-asc") s.sort((a, b) => (parseInt(a.year) || 0) - (parseInt(b.year) || 0));
  return s;
}

// ═══════════════════════════════════════════════════════════════════
// LAYOUT TEMPLATES (larger default sizes)
// ═══════════════════════════════════════════════════════════════════
function genLayout(key, pw, ph) {
  const W = pw * PX, H = ph * PX, M = 10, g = 6, bT = 71 + M, bH = H - bT - M;
  const L = {
    "3col": { name: "3-Column Classic", desc: "Traditional conference layout.", blocks: (() => { const c = (W - M * 2 - g * 2) / 3; return [
      { type: "title", x: M, y: M, w: W - M * 2, h: 45 }, { type: "authors", x: M, y: 57, w: W - M * 2, h: 22 },
      { type: "heading", x: M, y: bT, w: c, h: 20, content: "Introduction" },
      { type: "text", x: M, y: bT + 22, w: c, h: bH * 0.42, content: "Background and research question. Provide context, motivation, and the gap your work addresses." },
      { type: "heading", x: M, y: bT + 24 + bH * 0.42, w: c, h: 20, content: "Hypotheses" },
      { type: "text", x: M, y: bT + 46 + bH * 0.42, w: c, h: bH * 0.42, content: "State your specific hypotheses or research aims here." },
      { type: "heading", x: M + c + g, y: bT, w: c, h: 20, content: "Methods" },
      { type: "text", x: M + c + g, y: bT + 22, w: c, h: bH * 0.35, content: "Participants, design, materials, procedure, and analysis approach." },
      { type: "image", x: M + c + g, y: bT + 24 + bH * 0.35, w: c, h: bH * 0.55 },
      { type: "heading", x: M + (c + g) * 2, y: bT, w: c, h: 20, content: "Results" },
      { type: "table", x: M + (c + g) * 2, y: bT + 22, w: c, h: bH * 0.32, tableData: { rows: 4, cols: 3, cells: ["Measure", "M (SD)", "𝑝", "DV 1", "4.2 (0.8)", "< .01", "DV 2", "3.1 (1.1)", ".03", "DV 3", "2.8 (0.6)", ".12"], colWidths: null, borderPreset: "apa" } },
      { type: "heading", x: M + (c + g) * 2, y: bT + 24 + bH * 0.32, w: c, h: 20, content: "Conclusions" },
      { type: "text", x: M + (c + g) * 2, y: bT + 46 + bH * 0.32, w: c, h: bH * 0.25, content: "Key findings, implications, and future directions." },
      { type: "references", x: M + (c + g) * 2, y: bT + 48 + bH * 0.59, w: c, h: bH * 0.32 },
    ]; })() },
    "2col": { name: "2-Col Wide Figure", desc: "Full-width figure zone.", blocks: (() => { const c = (W - M * 2 - g) / 2; return [
      { type: "title", x: M, y: M, w: W - M * 2, h: 45 }, { type: "authors", x: M, y: 57, w: W - M * 2, h: 22 },
      { type: "heading", x: M, y: bT, w: c, h: 20, content: "Introduction" },
      { type: "text", x: M, y: bT + 22, w: c, h: bH * 0.22, content: "Motivation and background." },
      { type: "heading", x: M + c + g, y: bT, w: c, h: 20, content: "Methods" },
      { type: "text", x: M + c + g, y: bT + 22, w: c, h: bH * 0.22, content: "Design and analysis approach." },
      { type: "heading", x: M, y: bT + 24 + bH * 0.22, w: W - M * 2, h: 20, content: "Key Results" },
      { type: "image", x: M, y: bT + 46 + bH * 0.22, w: W - M * 2, h: bH * 0.38 },
      { type: "heading", x: M, y: bT + 48 + bH * 0.6, w: c, h: 20, content: "Discussion" },
      { type: "text", x: M, y: bT + 70 + bH * 0.6, w: c, h: bH * 0.22, content: "Interpretation of findings." },
      { type: "references", x: M + c + g, y: bT + 48 + bH * 0.6, w: c, h: bH * 0.28 },
    ]; })() },
    billboard: { name: "Billboard", desc: "Award-winning assertion-evidence.", blocks: (() => { const c = (W - M * 2 - g * 2) / 3; return [
      { type: "title", x: M, y: M, w: W - M * 2, h: 45 }, { type: "authors", x: M, y: 57, w: W - M * 2, h: 22 },
      { type: "text", x: M + 15, y: bT, w: W - M * 2 - 30, h: 55, content: "YOUR KEY FINDING IN ONE CLEAR SENTENCE. Make this the takeaway." },
      { type: "image", x: M, y: bT + 60, w: W - M * 2, h: bH * 0.42 },
      { type: "heading", x: M, y: bT + 64 + bH * 0.42, w: c, h: 20, content: "Background" },
      { type: "text", x: M, y: bT + 86 + bH * 0.42, w: c, h: bH * 0.35, content: "Brief context." },
      { type: "heading", x: M + c + g, y: bT + 64 + bH * 0.42, w: c, h: 20, content: "Methods" },
      { type: "text", x: M + c + g, y: bT + 86 + bH * 0.42, w: c, h: bH * 0.35, content: "Essential method details." },
      { type: "heading", x: M + (c + g) * 2, y: bT + 64 + bH * 0.42, w: c, h: 20, content: "Implications" },
      { type: "text", x: M + (c + g) * 2, y: bT + 86 + bH * 0.42, w: c, h: bH * 0.35, content: "So what? Future directions." },
    ]; })() },
    sidebar: { name: "Sidebar + Focus", desc: "Narrow text, wide visuals.", blocks: (() => { const sW = (W - M * 2 - g) * 0.3, mW = (W - M * 2 - g) * 0.7, mX = M + sW + g; return [
      { type: "title", x: M, y: M, w: W - M * 2, h: 45 }, { type: "authors", x: M, y: 57, w: W - M * 2, h: 22 },
      { type: "heading", x: M, y: bT, w: sW, h: 20, content: "Background" },
      { type: "text", x: M, y: bT + 22, w: sW, h: bH * 0.22, content: "Context and aims." },
      { type: "heading", x: M, y: bT + 24 + bH * 0.22, w: sW, h: 20, content: "Methods" },
      { type: "text", x: M, y: bT + 46 + bH * 0.22, w: sW, h: bH * 0.22, content: "Design and analysis." },
      { type: "heading", x: M, y: bT + 48 + bH * 0.44, w: sW, h: 20, content: "Conclusions" },
      { type: "text", x: M, y: bT + 70 + bH * 0.44, w: sW, h: bH * 0.18, content: "Key findings." },
      { type: "references", x: M, y: bT + 72 + bH * 0.64, w: sW, h: bH * 0.28 },
      { type: "heading", x: mX, y: bT, w: mW, h: 20, content: "Results" },
      { type: "image", x: mX, y: bT + 22, w: mW, h: bH * 0.47 },
      { type: "image", x: mX, y: bT + 24 + bH * 0.47, w: mW, h: bH * 0.45 },
    ]; })() },
    empty: { name: "Blank", desc: "Title + authors only.", blocks: [
      { type: "title", x: M, y: M, w: W - M * 2, h: 45 }, { type: "authors", x: M, y: 57, w: W - M * 2, h: 22 }
    ] },
  };
  return L[key] || L["3col"];
}
let _id = 100; const mkId = () => `b${_id++}`;
function mkBlocks(k, pw, ph) {
  return genLayout(k, pw, ph).blocks.map(b => ({
    id: mkId(), ...b, content: b.content || (b.type === "title" ? "Your Poster Title" : ""),
    imageSrc: null, imageFit: "contain",
    tableData: b.tableData || (b.type === "table" ? { rows: 3, cols: 3, cells: Array(9).fill(""), colWidths: null, borderPreset: "apa" } : null),
  }));
}

// ═══════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════
function useZoom(ref, sz) {
  const [z, setZ] = useState(null); const [fit, setFit] = useState(1);
  useEffect(() => { const c = () => { if (!ref.current) return; const r = ref.current.getBoundingClientRect(); const s = POSTER_SIZES[sz]; setFit(Math.min((r.width - 60) / (s.w * PX), (r.height - 60) / (s.h * PX), 2)); }; c(); window.addEventListener("resize", c); return () => window.removeEventListener("resize", c); }, [sz, ref]);
  return { zoom: z ?? fit, setZoom: setZ };
}
const SG = 5, ST = 3;
const snap = v => { const n = Math.round(v / SG) * SG; return Math.abs(v - n) < ST ? n : v; };
function useDrag(blocks, setBlocks, scale) {
  const s = useRef(null);
  return useCallback((e, id, mode) => {
    e.stopPropagation(); e.preventDefault(); const b = blocks.find(x => x.id === id); if (!b) return;
    s.current = { id, mode, sx: e.clientX, sy: e.clientY, ox: b.x, oy: b.y, ow: b.w, oh: b.h, isH: b.type === "heading" };
    const onM = ev => { if (!s.current) return; const dx = (ev.clientX - s.current.sx) / scale, dy = (ev.clientY - s.current.sy) / scale;
      setBlocks(p => p.map(b => { if (b.id !== s.current.id) return b;
        if (s.current.mode === "move") return { ...b, x: snap(Math.max(0, s.current.ox + dx)), y: snap(Math.max(0, s.current.oy + dy)) };
        const nw = Math.max(40, s.current.ow + dx);
        if (s.current.isH) return { ...b, w: snap(nw) };
        return { ...b, w: snap(nw), h: snap(Math.max(20, s.current.oh + dy)) };
      })); };
    const onU = () => { s.current = null; window.removeEventListener("pointermove", onM); window.removeEventListener("pointerup", onU); };
    window.addEventListener("pointermove", onM); window.addEventListener("pointerup", onU);
  }, [blocks, setBlocks, scale]);
}

// ═══════════════════════════════════════════════════════════════════
// SMART TEXT — uses textarea state for reliable slash commands
// ═══════════════════════════════════════════════════════════════════
function SmartText({ value, onChange, style, placeholder, multiline }) {
  const ref = useRef(null);
  const [showMenu, setShowMenu] = useState(false);
  const [menuFilter, setMenuFilter] = useState("");
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  // Get text and cursor position reliably
  const getTextAndCursor = () => {
    if (!ref.current) return { text: "", pos: 0 };
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return { text: ref.current.textContent || "", pos: 0 };
    const range = sel.getRangeAt(0).cloneRange();
    range.selectNodeContents(ref.current);
    range.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
    return { text: ref.current.textContent || "", pos: range.toString().length };
  };

  const checkSlash = () => {
    const { text, pos } = getTextAndCursor();
    const before = text.substring(0, pos);
    const m = before.match(/\/([a-zA-Z0-9]*)$/);
    if (m && m[0].length >= 2) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const rng = sel.getRangeAt(0);
        const rect = rng.getBoundingClientRect();
        const pr = ref.current.getBoundingClientRect();
        setMenuFilter(m[1]);
        setMenuPos({ top: rect.bottom - pr.top + 2, left: Math.max(0, rect.left - pr.left) });
        setShowMenu(true);
      }
    } else {
      setShowMenu(false);
    }
  };

  const insertSymbol = (key) => {
    const sym = SYMS[key];
    if (!sym || !ref.current) return;
    const { text, pos } = getTextAndCursor();
    const before = text.substring(0, pos);
    const slashIdx = before.lastIndexOf("/");
    if (slashIdx < 0) return;
    const newText = text.substring(0, slashIdx) + sym + text.substring(pos);
    ref.current.textContent = newText;
    onChange(newText);
    // Restore cursor after symbol
    try {
      const newPos = slashIdx + sym.length;
      const walker = document.createTreeWalker(ref.current, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      let offset = 0;
      while (node) {
        if (offset + node.length >= newPos) {
          const rng = document.createRange();
          rng.setStart(node, newPos - offset);
          rng.collapse(true);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(rng);
          break;
        }
        offset += node.length;
        node = walker.nextNode();
      }
    } catch (e) {}
    setShowMenu(false);
  };

  const handleInput = () => {
    if (!ref.current) return;
    onChange(ref.current.textContent || "");
    checkSlash();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") { setShowMenu(false); return; }
    if (showMenu && (e.key === "Tab" || e.key === "Enter")) {
      e.preventDefault();
      const filtered = Object.keys(SYMS).filter(k => k.startsWith(menuFilter));
      if (filtered.length > 0) insertSymbol(filtered[0]);
    }
  };

  useEffect(() => {
    if (ref.current && ref.current.textContent !== value) ref.current.textContent = value || "";
  }, []);

  const filtered = showMenu ? Object.entries(SYMS).filter(([k]) => k.startsWith(menuFilter)).slice(0, 8) : [];

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={ref} contentEditable suppressContentEditableWarning
        onInput={handleInput} onKeyDown={handleKeyDown}
        style={{ outline: "none", minHeight: "1em", cursor: "text", wordWrap: "break-word",
          whiteSpace: multiline ? "pre-wrap" : "normal", width: "100%", height: "100%", ...style }}
        data-placeholder={placeholder} />
      {showMenu && filtered.length > 0 && (
        <div style={{ position: "absolute", top: menuPos.top, left: menuPos.left, background: "#1a1a2e",
          border: "1px solid #444", borderRadius: 5, padding: 3, zIndex: 200, maxHeight: 140, overflow: "auto",
          boxShadow: "0 6px 20px rgba(0,0,0,0.5)", minWidth: 120 }}>
          {filtered.map(([k, sym]) => (
            <div key={k} onMouseDown={(e) => { e.preventDefault(); insertSymbol(k); }}
              style={{ padding: "4px 10px", cursor: "pointer", fontSize: 11, color: "#ddd",
                display: "flex", justifyContent: "space-between", gap: 16, borderRadius: 3 }}
              onMouseOver={e => e.currentTarget.style.background = "#333"}
              onMouseOut={e => e.currentTarget.style.background = "transparent"}>
              <span style={{ color: "#7c6aed", fontFamily: "monospace", fontSize: 10 }}>/{k}</span>
              <span style={{ fontSize: 13 }}>{sym}</span>
            </div>
          ))}
          <div style={{ fontSize: 8, color: "#555", padding: "3px 10px", borderTop: "1px solid #333" }}>Tab or Enter to insert</div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// REFERENCE MANAGER + BLOCK
// ═══════════════════════════════════════════════════════════════════
function parseRIS(t) { const r = []; let c = null; t.split("\n").forEach(l => { const m = l.match(/^([A-Z][A-Z0-9])\s+-\s+(.*)/); if (m) { if (m[1]==="TY") c={authors:[],year:"",title:"",journal:"",doi:""}; else if(c){ if(m[1]==="AU"||m[1]==="A1")c.authors.push(m[2].trim()); else if(m[1]==="PY"||m[1]==="Y1")c.year=m[2].trim().split("/")[0]; else if(m[1]==="TI"||m[1]==="T1")c.title=m[2].trim(); else if(m[1]==="JO"||m[1]==="JF"||m[1]==="T2")c.journal=c.journal||m[2].trim(); else if(m[1]==="DO")c.doi=m[2].trim(); else if(m[1]==="ER"){if(c.title)r.push(c);c=null;}}}}); if(c?.title)r.push(c); return r; }
function parseBib(t) { const r=[]; t.split(/(?=@\w+\{)/).forEach(e=>{ if(!e.trim())return; const g=n=>{const m=e.match(new RegExp(n+`\\s*=\\s*[{"]([^}"]*)[}"]`));return m?m[1]:"";}; const ti=g("title");if(!ti)return; const a=g("author"); r.push({authors:a?a.split(/\s+and\s+/).map(x=>x.trim()):[],year:g("year"),title:ti,journal:g("journal")||g("booktitle"),doi:g("doi")}); }); return r; }

function RefManager({ references, setReferences, citStyle, setCitStyle, sortMode, setSortMode }) {
  const fRef = useRef(null);
  const [me, setMe] = useState({ authors: "", year: "", title: "", journal: "" });
  const inp = { all: "unset", background: "#1a1a26", border: "1px solid #2a2a3a", borderRadius: 4, padding: "3px 6px", color: "#ddd", fontSize: 10, width: "100%", boxSizing: "border-box" };
  const sel = { ...inp, appearance: "auto", padding: "4px 6px" };
  const handleImport = e => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = ev => { let p = parseBib(ev.target.result); if (!p.length) p = parseRIS(ev.target.result); if (p.length) setReferences(prev => [...prev, ...p]); }; r.readAsText(f); };
  const addManual = () => { if (!me.title.trim()) return; setReferences(p => [...p, { authors: me.authors.split(",").map(a => a.trim()).filter(Boolean), year: me.year, title: me.title, journal: me.journal, doi: "" }]); setMe({ authors: "", year: "", title: "", journal: "" }); };

  return (<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    <button onClick={() => fRef.current?.click()} style={{ padding: "6px 10px", background: "#7c6aed", color: "#fff", border: "none", borderRadius: 5, cursor: "pointer", fontSize: 10, fontWeight: 600 }}>Import .bib / .ris / .enw</button>
    <input ref={fRef} type="file" accept=".bib,.bibtex,.ris,.enw" onChange={handleImport} style={{ display: "none" }} />

    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <label style={{ fontSize: 8, color: "#666", whiteSpace: "nowrap" }}>Style</label>
      <select value={citStyle} onChange={e => setCitStyle(e.target.value)} style={sel}>{Object.keys(CIT_STYLES).map(s => <option key={s} value={s}>{s}</option>)}</select>
    </div>
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <label style={{ fontSize: 8, color: "#666", whiteSpace: "nowrap" }}>Sort</label>
      <select value={sortMode} onChange={e => setSortMode(e.target.value)} style={sel}>{Object.entries(SORT_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
    </div>

    {references.map((r, i) => (
      <div key={i} style={{ display: "flex", gap: 3, alignItems: "flex-start", padding: "4px 6px", background: "#14141e", border: "1px solid #222", borderRadius: 4 }}>
        <span style={{ fontSize: 9, color: "#aaa", flex: 1, lineHeight: 1.4 }}>{CIT_STYLES[citStyle](r, i)}</span>
        <div style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <button onClick={() => { if (i > 0) setReferences(p => { const n = [...p]; [n[i-1],n[i]]=[n[i],n[i-1]]; return n; }); }} style={{ all: "unset", cursor: "pointer", fontSize: 7, color: "#666" }}>▲</button>
          <button onClick={() => setReferences(p => p.filter((_, j) => j !== i))} style={{ all: "unset", cursor: "pointer", fontSize: 9, color: "#c55" }}>×</button>
        </div>
      </div>
    ))}

    <div style={{ fontSize: 8, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "1px", marginTop: 6 }}>Manual Entry</div>
    <input value={me.authors} onChange={e => setMe(p => ({ ...p, authors: e.target.value }))} placeholder="Authors (Last, F., comma-separated)" style={inp} />
    <div style={{ display: "flex", gap: 4 }}><input value={me.year} onChange={e => setMe(p => ({ ...p, year: e.target.value }))} placeholder="Year" style={{ ...inp, width: "30%" }} /><input value={me.journal} onChange={e => setMe(p => ({ ...p, journal: e.target.value }))} placeholder="Journal" style={{ ...inp, flex: 1 }} /></div>
    <input value={me.title} onChange={e => setMe(p => ({ ...p, title: e.target.value }))} placeholder="Title" style={inp} />
    <button onClick={addManual} style={{ padding: "5px", background: "#1a1a26", color: "#7c6aed", border: "1px solid #333", borderRadius: 4, cursor: "pointer", fontSize: 9, fontWeight: 600 }}>+ Add Reference</button>
  </div>);
}

function RefsBlock({ references, palette, fontFamily, styles, citStyle }) {
  if (!references?.length) return <div style={{ color: palette.muted, fontSize: styles.body.size, fontStyle: "italic" }}>Add references in Refs tab →</div>;
  const fmt = CIT_STYLES[citStyle] || CIT_STYLES["APA 7"];
  return (<div style={{ fontFamily, fontSize: styles.body.size * 0.88, color: palette.primary, lineHeight: styles.body.lineHeight }}>
    <div style={{ fontWeight: 700, fontSize: styles.body.size, marginBottom: 3, color: palette.accent }}>References</div>
    {references.map((r, i) => <div key={i} style={{ marginBottom: 2, opacity: 0.85 }}>{fmt(r, i)}</div>)}
  </div>);
}

// ═══════════════════════════════════════════════════════════════════
// TABLE, IMAGE, LOGO, AUTHOR BLOCKS (compact, preserved from v4)
// ═══════════════════════════════════════════════════════════════════
function TableBlock({ block, palette, fontFamily, onUpdate, styles }) {
  const d = block.tableData || { rows: 3, cols: 3, cells: Array(9).fill(""), colWidths: null, borderPreset: "apa" };
  const pr = TB_PRESETS[d.borderPreset || "apa"] || TB_PRESETS.apa;
  const cw = d.colWidths || Array(d.cols).fill(100 / d.cols);
  const uc = (r, c, v) => { const nc = [...d.cells]; nc[r * d.cols + c] = v; onUpdate({ tableData: { ...d, cells: nc } }); };
  const addR = () => onUpdate({ tableData: { ...d, rows: d.rows + 1, cells: [...d.cells, ...Array(d.cols).fill("")] } });
  const addC = () => { const nc = []; for (let r = 0; r < d.rows; r++) { for (let c = 0; c < d.cols; c++) nc.push(d.cells[r * d.cols + c]); nc.push(""); } onUpdate({ tableData: { ...d, cols: d.cols + 1, cells: nc, colWidths: Array(d.cols + 1).fill(100/(d.cols+1)) } }); };
  const delR = () => { if (d.rows <= 1) return; onUpdate({ tableData: { ...d, rows: d.rows - 1, cells: d.cells.slice(0, (d.rows-1)*d.cols) } }); };
  const delC = () => { if (d.cols <= 1) return; const nc = []; for (let r = 0; r < d.rows; r++) for (let c = 0; c < d.cols - 1; c++) nc.push(d.cells[r*d.cols+c]); onUpdate({ tableData: { ...d, cols: d.cols-1, cells: nc, colWidths: null } }); };
  const onPaste = e => { const html=e.clipboardData.getData("text/html"),txt=e.clipboardData.getData("text/plain"); let rows=[]; if(html?.includes("<tr")){new DOMParser().parseFromString(html,"text/html").querySelectorAll("tr").forEach(tr=>{const c=[];tr.querySelectorAll("td,th").forEach(td=>c.push(td.textContent.trim()));if(c.length)rows.push(c);});}else if(txt)rows=txt.split("\n").filter(l=>l.trim()).map(l=>l.split("\t")); if(rows.length){e.preventDefault();const mc=Math.max(...rows.map(r=>r.length));const c=[];rows.forEach(r=>{for(let i=0;i<mc;i++)c.push(r[i]||"");});onUpdate({tableData:{...d,rows:rows.length,cols:mc,cells:c,colWidths:null}});} };
  const cb = (r, c) => { const lw = "0.8px", col = palette.muted + "55"; let t = "none", ri = "none", b = "none", l = "none";
    if (pr.oB) { if (r===0) t=`${lw} solid ${col}`; if (r===d.rows-1) b=`${lw} solid ${col}`; if (c===0) l=`${lw} solid ${col}`; if (c===d.cols-1) ri=`${lw} solid ${col}`; }
    if (pr.topL && r===0) t=`1.5px solid ${palette.primary}`; if (pr.hdrL && r===1) t=`1px solid ${palette.primary}`; if (pr.botL && r===d.rows-1) b=`1.5px solid ${palette.primary}`;
    if (pr.hL && r > 0) t=`${lw} solid ${col}`; if (pr.vL && c > 0) l=`${lw} solid ${col}`;
    if (pr.hBox && r===0) { t=`1.5px solid ${palette.primary}`; b=`1px solid ${palette.primary}`; if(c===0)l=`1px solid ${palette.primary}`; if(c===d.cols-1)ri=`1px solid ${palette.primary}`; }
    return { borderTop: t, borderRight: ri, borderBottom: b, borderLeft: l }; };
  return (<div style={{ width:"100%",height:"100%",overflow:"auto",padding:2,display:"flex",flexDirection:"column" }} onPaste={onPaste}>
    <div style={{ flex: 1, overflow: "auto" }}>
      <table style={{ width:"100%",borderCollapse:"collapse",fontFamily,fontSize:styles.body.size,tableLayout:"fixed" }}>
        <colgroup>{cw.map((w,i)=><col key={i} style={{width:`${w}%`}} />)}</colgroup>
        <tbody>{Array.from({length:d.rows}).map((_,r)=><tr key={r}>{Array.from({length:d.cols}).map((_,c)=><td key={c} style={{...cb(r,c),padding:"2px 4px",background:r===0?palette.accent+"0a":"transparent",fontWeight:r===0?700:400,color:palette.primary}}><input value={d.cells[r*d.cols+c]||""} onChange={e=>uc(r,c,e.target.value)} style={{all:"unset",width:"100%",fontFamily,fontSize:styles.body.size,color:palette.primary}} /></td>)}</tr>)}</tbody>
      </table>
    </div>
    <div style={{ display:"flex",gap:3,marginTop:2,flexWrap:"wrap",alignItems:"center" }}>
      <button onClick={addR} style={{all:"unset",cursor:"pointer",fontSize:7,color:palette.accent}}>+Row</button>
      <button onClick={addC} style={{all:"unset",cursor:"pointer",fontSize:7,color:palette.accent}}>+Col</button>
      <button onClick={delR} style={{all:"unset",cursor:"pointer",fontSize:7,color:"#c55"}}>−Row</button>
      <button onClick={delC} style={{all:"unset",cursor:"pointer",fontSize:7,color:"#c55"}}>−Col</button>
      <span style={{fontSize:6,color:"#555"}}>│</span>
      {Object.entries(TB_PRESETS).map(([k,v])=><button key={k} onClick={()=>onUpdate({tableData:{...d,borderPreset:k}})} style={{all:"unset",cursor:"pointer",fontSize:7,padding:"1px 3px",borderRadius:2,color:(d.borderPreset||"apa")===k?"#7c6aed":"#666",background:(d.borderPreset||"apa")===k?"#7c6aed18":"transparent"}}>{v.n}</button>)}
    </div>
  </div>);
}
function LogoBlock({block,onUpdate}){const r=useRef(null);const h=e=>{const f=e.target.files?.[0];if(!f)return;const rd=new FileReader();rd.onload=ev=>onUpdate({imageSrc:ev.target.result});rd.readAsDataURL(f);};if(block.imageSrc)return <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center"}}><img src={block.imageSrc} alt="" style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain"}} /></div>;return <div onClick={()=>r.current?.click()} style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",border:"1.5px dashed #ccc",borderRadius:4,cursor:"pointer",fontSize:8,color:"#999",flexDirection:"column",gap:2}}><span>+ Logo</span><input ref={r} type="file" accept="image/*" onChange={h} style={{display:"none"}} /></div>;}
function ImageBlock({block,palette,onUpdate}){const r=useRef(null);const h=e=>{const f=e.target.files?.[0];if(!f)return;const rd=new FileReader();rd.onload=ev=>onUpdate({imageSrc:ev.target.result});rd.readAsDataURL(f);};const tF=()=>{const n=(block.imageFit||"contain")==="contain"?"cover":(block.imageFit||"contain")==="cover"?"fill":"contain";onUpdate({imageFit:n});};if(block.imageSrc)return <div style={{width:"100%",height:"100%",position:"relative",overflow:"hidden"}}><img src={block.imageSrc} alt="" style={{width:"100%",height:"100%",objectFit:block.imageFit||"contain"}} /><div style={{position:"absolute",top:2,right:2,display:"flex",gap:2}}><button onClick={tF} style={{background:"rgba(0,0,0,.6)",color:"#fff",border:"none",borderRadius:3,width:18,height:18,fontSize:7,cursor:"pointer"}}>{(block.imageFit||"contain")[0].toUpperCase()}</button><button onClick={()=>r.current?.click()} style={{background:"rgba(0,0,0,.6)",color:"#fff",border:"none",borderRadius:3,width:18,height:18,fontSize:8,cursor:"pointer"}}>↻</button><button onClick={()=>onUpdate({imageSrc:null})} style={{background:"rgba(180,30,30,.8)",color:"#fff",border:"none",borderRadius:3,width:18,height:18,fontSize:10,cursor:"pointer"}}>×</button></div><input ref={r} type="file" accept="image/*" onChange={h} style={{display:"none"}} /></div>;return <div onClick={()=>r.current?.click()} style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",border:`1.5px dashed ${palette.muted}44`,borderRadius:4,cursor:"pointer",color:palette.muted,fontSize:9,gap:3}}><span>Upload figure</span><input ref={r} type="file" accept="image/*" onChange={h} style={{display:"none"}} /></div>;}

// ═══════════════════════════════════════════════════════════════════
// AUTHOR SYSTEM (institution-first, compact)
// ═══════════════════════════════════════════════════════════════════
function InstMgr({insts,setInsts}){const inp={all:"unset",background:"#1a1a26",border:"1px solid #2a2a3a",borderRadius:4,padding:"4px 6px",color:"#ddd",fontSize:10,width:"100%",boxSizing:"border-box"};return(<div style={{display:"flex",flexDirection:"column",gap:6}}>{insts.map((inst,i)=><div key={inst.id} style={{background:"#14141e",border:"1px solid #222",borderRadius:5,padding:"6px 8px"}}><div style={{display:"flex",alignItems:"center",gap:4,marginBottom:4}}><div style={{width:16,height:16,borderRadius:3,background:"#7c6aed22",border:"1px solid #7c6aed44",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:"#7c6aed",flexShrink:0}}>{i+1}</div><input value={inst.name} onChange={e=>setInsts(p=>p.map(x=>x.id===inst.id?{...x,name:e.target.value}:x))} placeholder="University" style={{...inp,fontSize:11,fontWeight:600,color:"#eee"}} /><button onClick={()=>setInsts(p=>p.filter(x=>x.id!==inst.id))} style={{all:"unset",cursor:"pointer",color:"#c55",fontSize:12,fontWeight:700}}>×</button></div><div style={{display:"flex",gap:4}}><input value={inst.dept||""} onChange={e=>setInsts(p=>p.map(x=>x.id===inst.id?{...x,dept:e.target.value}:x))} placeholder="Department" style={{...inp,flex:1}} /><input value={inst.location||""} onChange={e=>setInsts(p=>p.map(x=>x.id===inst.id?{...x,location:e.target.value}:x))} placeholder="City" style={{...inp,flex:1}} /></div></div>)}<button onClick={()=>setInsts(p=>[...p,{id:`i${Date.now()}`,name:"",dept:"",location:""}])} style={{all:"unset",cursor:"pointer",padding:"5px 0",fontSize:10,color:"#7c6aed",fontWeight:600,textAlign:"center",border:"1px dashed #333",borderRadius:4}}>+ Add Institution</button></div>);}
function AuthMgr({auths,setAuths,insts}){const inp={all:"unset",background:"#1a1a26",border:"1px solid #2a2a3a",borderRadius:4,padding:"4px 6px",color:"#ddd",fontSize:11,width:"100%",boxSizing:"border-box"};return(<div style={{display:"flex",flexDirection:"column",gap:5}}>{auths.map((a,i)=><div key={a.id} style={{background:"#14141e",border:"1px solid #222",borderRadius:5,padding:"6px 8px"}}><div style={{display:"flex",alignItems:"center",gap:3}}><div style={{display:"flex",flexDirection:"column",flexShrink:0}}><button onClick={()=>{if(i>0)setAuths(p=>{const n=[...p];[n[i-1],n[i]]=[n[i],n[i-1]];return n;});}} style={{all:"unset",cursor:"pointer",color:i>0?"#666":"#2a2a3a",fontSize:8}}>▲</button><button onClick={()=>{if(i<auths.length-1)setAuths(p=>{const n=[...p];[n[i],n[i+1]]=[n[i+1],n[i]];return n;});}} style={{all:"unset",cursor:"pointer",color:i<auths.length-1?"#666":"#2a2a3a",fontSize:8}}>▼</button></div><input value={a.name} onChange={e=>setAuths(p=>p.map(x=>x.id===a.id?{...x,name:e.target.value}:x))} placeholder="Author name" style={{...inp,flex:1}} /><button onClick={()=>setAuths(p=>p.filter(x=>x.id!==a.id))} style={{all:"unset",cursor:"pointer",color:"#c55",fontSize:12,fontWeight:700}}>×</button></div>{insts.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:4,paddingLeft:16}}>{insts.map((inst,idx)=>{const ch=(a.affiliationIds||[]).includes(inst.id);return <button key={inst.id} onClick={()=>setAuths(p=>p.map(x=>x.id!==a.id?x:{...x,affiliationIds:ch?(x.affiliationIds||[]).filter(z=>z!==inst.id):[...(x.affiliationIds||[]),inst.id]}))} style={{all:"unset",cursor:"pointer",display:"flex",alignItems:"center",gap:3,padding:"2px 6px",borderRadius:3,fontSize:9,background:ch?"#7c6aed22":"#1a1a26",border:`1px solid ${ch?"#7c6aed66":"#2a2a3a"}`,color:ch?"#b8a8ff":"#666"}}><span style={{fontSize:8,fontWeight:800}}>{idx+1}</span><span style={{maxWidth:80,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{inst.name||"?"}</span></button>;})}</div>}<div style={{display:"flex",gap:6,marginTop:4,paddingLeft:16}}><label style={{display:"flex",alignItems:"center",gap:3,fontSize:9,color:"#666",cursor:"pointer"}}><input type="checkbox" checked={a.isCorresponding||false} onChange={e=>setAuths(p=>p.map(x=>x.id===a.id?{...x,isCorresponding:e.target.checked}:x))} style={{width:10,height:10,accentColor:"#7c6aed"}} />Corr.</label><label style={{display:"flex",alignItems:"center",gap:3,fontSize:9,color:"#666",cursor:"pointer"}}><input type="checkbox" checked={a.equalContrib||false} onChange={e=>setAuths(p=>p.map(x=>x.id===a.id?{...x,equalContrib:e.target.checked}:x))} style={{width:10,height:10,accentColor:"#7c6aed"}} />Equal</label></div></div>)}<button onClick={()=>setAuths(p=>[...p,{id:`a${Date.now()}`,name:"",affiliationIds:[],isCorresponding:false,equalContrib:false}])} style={{all:"unset",cursor:"pointer",padding:"5px 0",fontSize:10,color:"#7c6aed",fontWeight:600,textAlign:"center",border:"1px dashed #333",borderRadius:4}}>+ Add Author</button></div>);}
function AuthorLine({auths,insts,palette,fontFamily,styles}){const ui=new Set();auths.forEach(a=>(a.affiliationIds||[]).forEach(id=>ui.add(id)));const used=insts.filter(i=>ui.has(i.id));const va=auths.filter(a=>a.name);if(!va.length)return <span style={{color:palette.muted,fontStyle:"italic",fontSize:styles.authors.size}}>Add authors in sidebar →</span>;const hE=va.some(a=>a.equalContrib),hC=va.some(a=>a.isCorresponding);return(<div style={{textAlign:"center",fontFamily,fontSize:styles.authors.size,fontWeight:styles.authors.weight,color:palette.primary,lineHeight:styles.authors.lineHeight}}><div>{va.map((a,i)=>{const ai=(a.affiliationIds||[]).map(id=>used.findIndex(x=>x.id===id)).filter(x=>x>=0).map(x=>x+1);const m=[...ai];if(a.equalContrib)m.push("*");if(a.isCorresponding)m.push("†");return <span key={a.id}>{i>0?", ":""}{a.name}{m.length>0&&<sup style={{fontSize:"0.6em",color:palette.accent,fontWeight:600}}>{m.join(",")}</sup>}</span>;})}</div>{used.length>0&&<div style={{fontSize:styles.authors.size*0.82,color:palette.muted,marginTop:1}}>{used.map((inst,i)=><span key={inst.id}>{i>0?" · ":""}<sup style={{fontSize:"0.7em",fontWeight:600}}>{i+1}</sup>{[inst.name,inst.dept,inst.location].filter(Boolean).join(", ")}</span>)}</div>}{(hE||hC)&&<div style={{fontSize:styles.authors.size*0.72,color:palette.muted,marginTop:1,fontStyle:"italic"}}>{hE&&"*Equal contribution"}{hE&&hC&&" · "}{hC&&"†Corresponding author"}</div>}</div>);}

// ═══════════════════════════════════════════════════════════════════
// POSTER BLOCK
// ═══════════════════════════════════════════════════════════════════
function Block({ block: b, palette: p, fontFamily: ff, styles: st, hs, selected, onSelect, onPD, onUpdate, onDel, auths, insts, refs, citStyle, hNum }) {
  const s = b.type === "title" ? st.title : b.type === "authors" ? st.authors : b.type === "heading" ? st.heading : st.body;
  const isH = b.type === "heading";
  const hBdr = () => { if (hs.borderStyle === "bottom") return { borderBottom: `1.5px solid ${p.accent}44`, paddingBottom: 2 }; if (hs.borderStyle === "left") return { borderLeft: `3px solid ${p.accent}`, paddingLeft: 6 }; if (hs.borderStyle === "box") return { border: `1px solid ${p.accent}33`, padding: "3px 6px", borderRadius: 3 }; if (hs.borderStyle === "underline-thick") return { borderBottom: `3px solid ${p.accent}`, paddingBottom: 1 }; return {}; };
  const bg = isH ? (hs.useBgFill ? p.accent + "15" : hs.borderStyle === "box" ? p.accent + "08" : "transparent") : "transparent";
  const txtStyle = { fontFamily: ff, fontSize: s.size, fontWeight: s.weight, fontStyle: s.italic ? "italic" : "normal", color: s.color || p.primary, lineHeight: s.lineHeight, backgroundColor: s.highlight || "transparent" };

  return (
    <div onClick={e => { e.stopPropagation(); onSelect(b.id); }} onPointerDown={e => { if (b.type !== "table") onPD(e, b.id, "move"); }}
      style={{ position: "absolute", left: b.x, top: b.y, width: b.w, height: isH ? "auto" : b.h, background: bg, border: selected ? `1.5px solid ${p.accent}88` : "1px solid transparent", borderRadius: 2, cursor: b.type === "table" ? "default" : "move", padding: ["table", "image", "logo"].includes(b.type) ? 0 : "4px 6px", boxSizing: "border-box", overflow: "visible" }}>
      <div style={{ width: "100%", height: isH ? "auto" : "100%", overflow: isH ? "visible" : "hidden" }}>
        {b.type === "title" && <SmartText value={b.content} onChange={v => onUpdate(b.id, { content: v })} placeholder="Poster Title" style={{ ...txtStyle, fontSize: st.title.size, fontWeight: st.title.weight, color: st.title.color || p.primary, lineHeight: st.title.lineHeight, textAlign: "center" }} />}
        {b.type === "authors" && <AuthorLine auths={auths} insts={insts} palette={p} fontFamily={ff} styles={st} />}
        {isH && <div style={{ ...txtStyle, fontSize: st.heading.size, fontWeight: st.heading.weight, color: st.heading.color || p.accent, lineHeight: st.heading.lineHeight, textAlign: hs.textAlign, ...hBdr(), display: "flex", alignItems: "baseline", gap: 4 }}>{hs.showNumber && hNum > 0 && <span>{hNum}.</span>}<SmartText value={b.content} onChange={v => onUpdate(b.id, { content: v })} placeholder="Section Heading" style={{ fontSize: st.heading.size, fontWeight: st.heading.weight, color: st.heading.color || p.accent, flex: 1 }} /></div>}
        {b.type === "text" && <SmartText value={b.content} onChange={v => onUpdate(b.id, { content: v })} multiline placeholder="Type here… (type / for symbols)" style={txtStyle} />}
        {b.type === "references" && <RefsBlock references={refs} palette={p} fontFamily={ff} styles={st} citStyle={citStyle} />}
        {b.type === "image" && <ImageBlock block={b} palette={p} onUpdate={u => onUpdate(b.id, u)} />}
        {b.type === "logo" && <LogoBlock block={b} onUpdate={u => onUpdate(b.id, u)} />}
        {b.type === "table" && <div onPointerDown={e => onPD(e, b.id, "move")} style={{ cursor: "move", height: 10, background: p.accent + "08", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="16" height="4" viewBox="0 0 16 4"><circle cx="4" cy="2" r="1" fill={p.muted}/><circle cx="8" cy="2" r="1" fill={p.muted}/><circle cx="12" cy="2" r="1" fill={p.muted}/></svg></div>}
        {b.type === "table" && <TableBlock block={b} palette={p} fontFamily={ff} onUpdate={u => onUpdate(b.id, u)} styles={st} />}
      </div>
      {!isH && <div onPointerDown={e => onPD(e, b.id, "resize")} style={{ position: "absolute", right: 0, bottom: 0, width: 14, height: 14, cursor: "nwse-resize", opacity: selected ? 0.8 : 0 }}><svg width="14" height="14" viewBox="0 0 14 14"><path d="M12 2L2 12M12 7L7 12" stroke={p.accent} strokeWidth="1.2" strokeLinecap="round"/></svg></div>}
      {isH && selected && <div onPointerDown={e => onPD(e, b.id, "resize")} style={{ position: "absolute", right: -3, top: 0, width: 6, height: "100%", cursor: "ew-resize" }}><div style={{ width: 2, height: "100%", background: p.accent, borderRadius: 1, margin: "0 auto", opacity: 0.5 }} /></div>}
      {selected && <button onClick={e => { e.stopPropagation(); onDel(b.id); }} style={{ position: "absolute", top: -9, right: -9, width: 18, height: 18, borderRadius: "50%", background: "#d33", color: "#fff", border: "2px solid #0a0a12", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, zIndex: 10 }}>×</button>}
      {selected && <div style={{ position: "absolute", top: -9, left: 3, fontSize: 6, background: p.accent, color: "#fff", padding: "1px 5px", borderRadius: 2, fontFamily: "system-ui", fontWeight: 700, textTransform: "uppercase", zIndex: 10, whiteSpace: "nowrap", pointerEvents: "none" }}>{b.type}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SIDEBAR TEXT EDITOR (for selected block)
// ═══════════════════════════════════════════════════════════════════
function BlockEditor({ block, onUpdate, palette, styles, setStyles }) {
  if (!block || !["text", "heading", "title"].includes(block.type)) return null;
  const typeKey = block.type === "title" ? "title" : block.type === "heading" ? "heading" : "body";
  const s = styles[typeKey];
  const upd = (f, v) => setStyles(p => ({ ...p, [typeKey]: { ...p[typeKey], [f]: v } }));
  const inp = { all: "unset", background: "#1a1a26", border: "1px solid #2a2a3a", borderRadius: 4, padding: "3px 6px", color: "#ddd", fontSize: 10, boxSizing: "border-box" };
  const HIGHLIGHTS = [null, "#FFEB3B44", "#4CAF5033", "#2196F333", "#FF572233", "#E040FB33"];

  return (<div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 0" }}>
    <div style={{ fontSize: 8, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "1px" }}>Editing: {block.type}</div>
    {/* Content textarea */}
    <textarea value={block.content} onChange={e => onUpdate(block.id, { content: e.target.value })}
      style={{ all: "unset", background: "#1a1a26", border: "1px solid #2a2a3a", borderRadius: 5, padding: "6px 8px", color: "#ddd", fontSize: 10, minHeight: 60, maxHeight: 120, overflow: "auto", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5, width: "100%", boxSizing: "border-box" }} />
    {/* Formatting row */}
    <div style={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "center" }}>
      <label style={{ fontSize: 8, color: "#666" }}>Size</label>
      <input type="number" value={s.size} onChange={e => upd("size", +e.target.value)} min={5} max={60} style={{ ...inp, width: 38, textAlign: "center" }} />
      <label style={{ fontSize: 8, color: "#666" }}>Wt</label>
      <select value={s.weight} onChange={e => upd("weight", +e.target.value)} style={{ ...inp, width: 50, appearance: "auto" }}>{[300, 400, 500, 600, 700, 800].map(w => <option key={w} value={w}>{w}</option>)}</select>
      <button onClick={() => upd("italic", !s.italic)} style={{ all: "unset", cursor: "pointer", padding: "2px 6px", borderRadius: 3, fontSize: 10, fontStyle: "italic", background: s.italic ? "#7c6aed33" : "#1a1a26", border: `1px solid ${s.italic ? "#7c6aed" : "#2a2a3a"}`, color: s.italic ? "#b8a8ff" : "#666" }}>I</button>
    </div>
    {/* Line height */}
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <label style={{ fontSize: 8, color: "#666", whiteSpace: "nowrap" }}>Line spacing</label>
      <input type="range" min={1} max={2.5} step={0.05} value={s.lineHeight} onChange={e => upd("lineHeight", +e.target.value)} style={{ flex: 1, accentColor: "#7c6aed" }} />
      <span style={{ fontSize: 9, color: "#888", minWidth: 24 }}>{s.lineHeight.toFixed(2)}</span>
    </div>
    {/* Text color */}
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <label style={{ fontSize: 8, color: "#666" }}>Color</label>
      <input type="color" value={s.color || palette.primary} onChange={e => upd("color", e.target.value)} style={{ width: 22, height: 22, border: "1px solid #333", borderRadius: 3, cursor: "pointer", padding: 0 }} />
      <button onClick={() => upd("color", null)} style={{ all: "unset", cursor: "pointer", fontSize: 8, color: "#666" }}>Reset</button>
    </div>
    {/* Highlight */}
    <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
      <label style={{ fontSize: 8, color: "#666" }}>Highlight</label>
      {HIGHLIGHTS.map((h, i) => (
        <div key={i} onClick={() => upd("highlight", h)}
          style={{ width: 16, height: 16, borderRadius: 3, background: h || "#1a1a26", border: `1.5px solid ${s.highlight === h ? "#7c6aed" : "#333"}`, cursor: "pointer" }} />
      ))}
    </div>
  </div>);
}

// ═══════════════════════════════════════════════════════════════════
// EDITORS (style, heading)
// ═══════════════════════════════════════════════════════════════════
function StyleEditor({ styles, setStyles }) {
  const ts = [{ k: "title", l: "Title" }, { k: "heading", l: "Heading" }, { k: "authors", l: "Authors" }, { k: "body", l: "Body" }];
  const u = (k, f, v) => setStyles(p => ({ ...p, [k]: { ...p[k], [f]: v } }));
  const inp = { all: "unset", background: "#1a1a26", border: "1px solid #2a2a3a", borderRadius: 4, padding: "3px 6px", color: "#ddd", fontSize: 10, width: 40, textAlign: "center", boxSizing: "border-box" };
  return (<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{ts.map(t => <div key={t.k}><div style={{ fontSize: 9, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>{t.l}</div><div style={{ display: "flex", gap: 3, alignItems: "center", flexWrap: "wrap", marginTop: 2 }}><input type="number" value={styles[t.k].size} onChange={e => u(t.k, "size", +e.target.value)} style={inp} min={5} max={60} /><select value={styles[t.k].weight} onChange={e => u(t.k, "weight", +e.target.value)} style={{ ...inp, width: 50, appearance: "auto" }}>{[300,400,500,600,700,800].map(w=><option key={w} value={w}>{w}</option>)}</select><button onClick={() => u(t.k, "italic", !styles[t.k].italic)} style={{ all: "unset", cursor: "pointer", padding: "2px 5px", borderRadius: 3, fontSize: 10, fontStyle: "italic", background: styles[t.k].italic ? "#7c6aed33" : "#1a1a26", border: `1px solid ${styles[t.k].italic ? "#7c6aed" : "#2a2a3a"}`, color: styles[t.k].italic ? "#b8a8ff" : "#666" }}>I</button><span style={{ fontSize: 8, color: "#555" }}>LH</span><input type="number" value={styles[t.k].lineHeight} onChange={e => u(t.k, "lineHeight", +e.target.value)} min={1} max={3} step={0.05} style={{ ...inp, width: 36 }} /></div></div>)}</div>);
}
function HeadingEditor({ hs, setHs }) {
  const u = (f, v) => setHs(p => ({ ...p, [f]: v }));
  const B = (v, l) => <button onClick={() => u("borderStyle", v)} style={{ all: "unset", cursor: "pointer", padding: "3px 7px", borderRadius: 3, fontSize: 9, background: hs.borderStyle === v ? "#7c6aed22" : "#1a1a26", border: `1px solid ${hs.borderStyle === v ? "#7c6aed66" : "#2a2a3a"}`, color: hs.borderStyle === v ? "#b8a8ff" : "#888" }}>{l}</button>;
  return (<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>{B("none", "None")}{B("bottom", "Bottom")}{B("left", "Left")}{B("box", "Box")}{B("underline-thick", "Thick")}</div>
    <div style={{ display: "flex", gap: 6 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9, color: "#888", cursor: "pointer" }}><input type="checkbox" checked={hs.showNumber} onChange={e => u("showNumber", e.target.checked)} style={{ accentColor: "#7c6aed" }} />Number</label>
      <label style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9, color: "#888", cursor: "pointer" }}><input type="checkbox" checked={hs.useBgFill} onChange={e => u("useBgFill", e.target.checked)} style={{ accentColor: "#7c6aed" }} />Fill</label>
      {["left", "center"].map(a => <button key={a} onClick={() => u("textAlign", a)} style={{ all: "unset", cursor: "pointer", padding: "2px 8px", borderRadius: 3, fontSize: 9, background: hs.textAlign === a ? "#7c6aed22" : "#1a1a26", border: `1px solid ${hs.textAlign === a ? "#7c6aed66" : "#2a2a3a"}`, color: hs.textAlign === a ? "#b8a8ff" : "#888", textTransform: "capitalize" }}>{a}</button>)}
    </div>
  </div>);
}

// ═══════════════════════════════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════════════════════════════
function Sidebar(props) {
  const { posterSize: ps, setPosterSize: sps, fontFamily: ff, setFontFamily: sff, palette: pal, setPalette: sp, showGrid: sg, setShowGrid: ssg, onAddBlock: ab, onAutoLayout: al, auths, setAuths: sa, insts, setInsts: si, onApply: oa, styles: st, setStyles: ss, hs, setHs: sh, refs, setRefs: sr, citStyle: cs, setCitStyle: scs, sortMode: sm, setSortMode: ssm, savedP: svp, onSaveP: osp, onLoadP: olp, selectedBlock: sb, onUpdate: ou } = props;
  const [tab, setTab] = useState("layout"); const [pN, setPN] = useState("");
  const ts = a => ({ flex: 1, padding: "8px 0", textAlign: "center", cursor: "pointer", fontWeight: 600, fontSize: 7, textTransform: "uppercase", letterSpacing: "0.7px", color: a ? "#fff" : "#555", borderBottom: a ? "2px solid #7c6aed" : "2px solid transparent", background: "none", border: "none", borderBottomWidth: 2, borderBottomStyle: "solid" });
  const lbl = { fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: "#555", marginBottom: 4, marginTop: 14 };
  const sel = { width: "100%", padding: "6px 7px", background: "#1a1a26", border: "1px solid #2a2a3a", borderRadius: 5, color: "#ddd", fontSize: 11, outline: "none" };
  const btn = a => ({ padding: "7px 10px", background: a ? "#7c6aed" : "#1a1a26", color: "#fff", border: a ? "none" : "1px solid #2a2a3a", borderRadius: 5, cursor: "pointer", fontSize: 10, fontWeight: 600, textAlign: "center", width: "100%" });

  return (<div style={{ width: 280, minWidth: 280, background: "#111118", color: "#c8cad0", display: "flex", flexDirection: "column", fontFamily: "'DM Sans',system-ui,sans-serif", fontSize: 11, borderRight: "1px solid #1e1e2e", overflow: "hidden" }}>
    <div style={{ padding: "12px 14px 0", display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 24, height: 24, borderRadius: 5, background: "linear-gradient(135deg,#7c6aed,#06d6a0)", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg></div>
      <div><div style={{ fontWeight: 800, fontSize: 13, color: "#fff" }}>PosterForge</div></div>
    </div>
    <div style={{ display: "flex", margin: "8px 12px 0", borderBottom: "1px solid #1e1e2e" }}>{["layout", "authors", "refs", "style", "edit"].map(t => <button key={t} onClick={() => setTab(t)} style={ts(tab === t)}>{t}</button>)}</div>
    <div style={{ flex: 1, overflow: "auto", padding: "0 12px 12px" }}>
      {tab === "layout" && <><div style={lbl}>Poster Size</div><select value={ps} onChange={e => sps(e.target.value)} style={sel}>{Object.entries(POSTER_SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <div style={lbl}>Grid</div><label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#888", cursor: "pointer" }}><input type="checkbox" checked={sg} onChange={e => ssg(e.target.checked)} style={{ accentColor: "#7c6aed" }} />Show grid</label>
        <div style={lbl}>Auto Layout</div><button onClick={al} style={{ ...btn(false), fontSize: 9 }}>⬡ Auto-Arrange</button>
        <div style={lbl}>Templates</div><div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{["3col", "2col", "billboard", "sidebar", "empty"].map(k => { const t = genLayout(k, POSTER_SIZES[ps].w, POSTER_SIZES[ps].h); return <button key={k} onClick={() => oa(k)} style={{ all: "unset", cursor: "pointer", padding: "7px 9px", background: "#1a1a26", border: "1px solid #2a2a3a", borderRadius: 5, display: "flex", flexDirection: "column", gap: 1 }} onMouseOver={e => e.currentTarget.style.borderColor = "#7c6aed"} onMouseOut={e => e.currentTarget.style.borderColor = "#2a2a3a"}><span style={{ fontSize: 10, fontWeight: 700, color: "#ddd" }}>{t.name}</span><span style={{ fontSize: 8, color: "#555" }}>{t.desc}</span></button>; })}</div>
        <div style={lbl}>Print</div><button onClick={() => window.print()} style={btn(true)}>⎙ Save PDF</button></>}

      {tab === "authors" && <><div style={lbl}>① Institutions</div><InstMgr insts={insts} setInsts={si} /><div style={{ ...lbl, marginTop: 14 }}>② Authors</div><AuthMgr auths={auths} setAuths={sa} insts={insts} />
        {auths.filter(a => a.name).length > 0 && <div style={{ marginTop: 10, padding: "6px 8px", background: "#14141e", border: "1px solid #222", borderRadius: 5 }}><div style={{ fontSize: 8, fontWeight: 700, color: "#555", marginBottom: 3 }}>PREVIEW</div><AuthorLine auths={auths} insts={insts} palette={pal} fontFamily={FONTS[ff]?.css || ff} styles={st} /></div>}
        <div style={{ ...lbl, marginTop: 14 }}>Logos</div><button onClick={() => ab("logo")} style={btn(false)}>+ Logo</button></>}

      {tab === "refs" && <><div style={lbl}>References</div><RefManager references={refs} setReferences={sr} citStyle={cs} setCitStyle={scs} sortMode={sm} setSortMode={ssm} /></>}

      {tab === "style" && <><div style={lbl}>Palette</div><div style={{ display: "flex", flexDirection: "column", gap: 3 }}>{PALETTES.map((p, i) => <div key={i} onClick={() => sp(p)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 6px", borderRadius: 4, cursor: "pointer", background: pal.name === p.name ? "#7c6aed18" : "transparent", border: pal.name === p.name ? "1px solid #7c6aed44" : "1px solid transparent" }}><div style={{ display: "flex", gap: 1.5 }}>{[p.bg, p.primary, p.accent, p.accent2].map((c, j) => <div key={j} style={{ width: 11, height: 11, borderRadius: 2, background: c, border: "1px solid #2a2a3a" }} />)}</div><span style={{ fontSize: 9, color: "#aaa" }}>{p.name}</span></div>)}</div>
        <div style={lbl}>Font</div><select value={ff} onChange={e => sff(e.target.value)} style={sel}><optgroup label="Sans">{Object.entries(FONTS).filter(([, v]) => v.cat === "sans").map(([k]) => <option key={k} value={k}>{k}</option>)}</optgroup><optgroup label="Serif">{Object.entries(FONTS).filter(([, v]) => v.cat === "serif").map(([k]) => <option key={k} value={k}>{k}</option>)}</optgroup></select>
        <div style={lbl}>Typography</div><StyleEditor styles={st} setStyles={ss} />
        <div style={lbl}>Headings</div><HeadingEditor hs={hs} setHs={sh} />
        <div style={lbl}>Presets</div><div style={{ display: "flex", gap: 4 }}><input value={pN} onChange={e => setPN(e.target.value)} placeholder="Name" style={{ ...sel, flex: 1, padding: "4px 6px", fontSize: 10 }} /><button onClick={() => { if (pN.trim()) { osp(pN.trim()); setPN(""); } }} style={{ ...btn(true), width: "auto", padding: "4px 10px", fontSize: 9 }}>Save</button></div>
        {svp.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>{svp.map((p, i) => <button key={i} onClick={() => olp(p)} style={{ ...btn(false), fontSize: 9, textAlign: "left", padding: "4px 8px" }}>{p.name}</button>)}</div>}</>}

      {tab === "edit" && <><div style={lbl}>Selected Block</div>
        {sb ? <BlockEditor block={sb} onUpdate={ou} palette={pal} styles={st} setStyles={ss} /> : <div style={{ fontSize: 10, color: "#555", padding: "8px 0" }}>Click a block on the poster to edit it here.</div>}
        <div style={lbl}>Add Block</div><div style={{ display: "flex", flexDirection: "column", gap: 3 }}>{[["heading", "Heading"], ["text", "Text"], ["image", "Image"], ["table", "Table"], ["references", "References"], ["logo", "Logo"]].map(([t, l]) => <button key={t} onClick={() => ab(t)} style={btn(false)}>+ {l}</button>)}</div>
        <div style={{ ...lbl, marginTop: 14 }}>Symbols (type / in text)</div>
        <div style={{ fontSize: 9, color: "#666", lineHeight: 1.5 }}>/alpha → α · /beta → β · /eta2 → η² · /chi2 → χ² · /leq → ≤ · /geq → ≥ · /pm → ± · /arrow → →<br/>Stats: /p → 𝑝 · /F → 𝐹 · /t → 𝑡 · /d → 𝑑 · /SD · /SE · /CI · /df → 𝑑𝑓</div>
      </>}
    </div>
  </div>);
}

function ZoomBar({ zoom, setZoom }) {
  return <div style={{ position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 2, background: "#1a1a26ee", borderRadius: 6, padding: "4px 8px", border: "1px solid #2a2a3a", zIndex: 10 }}>
    <button onClick={() => setZoom(Math.max(0.3, zoom - 0.15))} style={{ all: "unset", cursor: "pointer", color: "#aaa", fontSize: 14, padding: "2px 6px", fontWeight: 700 }}>−</button>
    <button onClick={() => setZoom(null)} style={{ all: "unset", cursor: "pointer", color: "#888", fontSize: 9, padding: "2px 8px", fontWeight: 600, fontFamily: "system-ui" }}>{Math.round(zoom * 100)}%</button>
    <button onClick={() => setZoom(Math.min(3, zoom + 0.15))} style={{ all: "unset", cursor: "pointer", color: "#aaa", fontSize: 14, padding: "2px 6px", fontWeight: 700 }}>+</button>
    <div style={{ width: 1, height: 14, background: "#333", margin: "0 4px" }} /><button onClick={() => setZoom(null)} style={{ all: "unset", cursor: "pointer", color: "#666", fontSize: 8, padding: "2px 6px", fontWeight: 600 }}>FIT</button>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════
export default function PosterForge() {
  const [ps, setPs] = useState("48×36");
  const [ff, setFf] = useState("Source Sans 3");
  const [pal, setPal] = useState(PALETTES[0]);
  const [st, setSt] = useState({ ...DEF_STYLES });
  const [hs, setHs] = useState({ ...DEF_HEADING });
  const [sg, setSg] = useState(true);
  const [insts, setInsts] = useState([{ id: "i1", name: "University A", dept: "Dept. of Psychology" }, { id: "i2", name: "University B", dept: "School of Engineering" }]);
  const [auths, setAuths] = useState([{ id: "a1", name: "First Author", affiliationIds: ["i1"], isCorresponding: true, equalContrib: false }, { id: "a2", name: "Second Author", affiliationIds: ["i2"], isCorresponding: false, equalContrib: false }, { id: "a3", name: "Third Author", affiliationIds: ["i1"], isCorresponding: false, equalContrib: false }]);
  const [rawRefs, setRawRefs] = useState([{ authors: ["Smith, J.", "Doe, A."], year: "2024", title: "Example study on academic posters", journal: "Journal of Visual Communication", doi: "" }, { authors: ["Zhang, L."], year: "2023", title: "Design principles for scientific presentations", journal: "Nature Methods", doi: "" }]);
  const [citStyle, setCitStyle] = useState("APA 7");
  const [sortMode, setSortMode] = useState("none");
  const refs = useMemo(() => sortRefs(rawRefs, sortMode), [rawRefs, sortMode]);
  const [blocks, setBlocks] = useState(() => mkBlocks("3col", 48, 36));
  const [sel, setSel] = useState(null);
  const [svp, setSvp] = useState([]);
  const cRef = useRef(null);
  const { zoom, setZoom } = useZoom(cRef, ps);
  const onPD = useDrag(blocks, setBlocks, zoom);
  const { w: pw, h: ph } = POSTER_SIZES[ps]; const cW = pw * PX, cH = ph * PX; const ffc = FONTS[ff]?.css || ff;
  const hCnt = useMemo(() => { const m = {}; let c = 0; blocks.filter(b => b.type === "heading").sort((a, b) => a.y - b.y || a.x - b.x).forEach(b => { c++; m[b.id] = c; }); return m; }, [blocks]);
  const selBlock = blocks.find(b => b.id === sel) || null;
  const apply = k => { setBlocks(mkBlocks(k, pw, ph)); setSel(null); };
  const chgSz = s => { setPs(s); setBlocks(mkBlocks("3col", POSTER_SIZES[s].w, POSTER_SIZES[s].h)); setSel(null); setZoom(null); };
  const autoLayout = () => { setBlocks(prev => { const M = 10, g = 6; const hdrs = prev.filter(b => b.type === "title" || b.type === "authors"); const body = prev.filter(b => b.type !== "title" && b.type !== "authors"); if (!body.length) return prev; const sh = hdrs.map(b => b.type === "title" ? { ...b, x: M, y: M, w: cW - M * 2 } : b.type === "authors" ? { ...b, x: M, y: 57, w: cW - M * 2 } : b); const xs = [...new Set(body.map(b => b.x))].sort((a, b) => a - b); const cls = []; xs.forEach(x => { const e = cls.find(c => Math.abs(c.c - x) < 30); if (e) { e.xs.push(x); e.c = e.xs.reduce((a, b) => a + b, 0) / e.xs.length; } else cls.push({ c: x, xs: [x] }); }); const nc = Math.max(1, cls.length); const colW = (cW - M * 2 - g * (nc - 1)) / nc; const cb = Array.from({ length: nc }, () => []); body.forEach(b => { let bi = 0, bd = Infinity; cls.forEach((c, i) => { const dd = Math.abs(b.x - c.c); if (dd < bd) { bd = dd; bi = i; } }); cb[bi].push(b); }); const bT = 81 + M; const sb = []; cb.forEach((col, ci) => { col.sort((a, b) => a.y - b.y); let cy = bT; col.forEach(b => { const isH = b.type === "heading"; const h = isH ? Math.round(st.heading.size * 1.6 + 8) : b.h; sb.push({ ...b, x: snap(M + ci * (colW + g)), y: snap(cy), w: snap(colW), ...(isH ? {} : { h: snap(h) }) }); cy += h + g; }); }); return [...sh, ...sb]; }); };
  const addBlk = type => { const b = { id: mkId(), type, x: 20, y: 80, w: type === "logo" ? 50 : 155, h: type === "logo" ? 40 : type === "heading" ? 22 : type === "references" ? 120 : 140, content: type === "heading" ? "Section Title" : type === "text" ? "Enter your text here." : "", imageSrc: null, imageFit: "contain", tableData: type === "table" ? { rows: 3, cols: 3, cells: Array(9).fill(""), colWidths: null, borderPreset: "apa" } : null }; setBlocks(p => [...p, b]); setSel(b.id); };
  const updBlk = (id, u) => setBlocks(p => p.map(b => b.id === id ? { ...b, ...u } : b));
  const delBlk = id => { setBlocks(p => p.filter(b => b.id !== id)); setSel(null); };
  const saveP = n => setSvp(p => [...p.filter(x => x.name !== n), { name: n, ff, pal, st: { ...st }, hs: { ...hs } }]);
  const loadP = p => { setFf(p.ff); setPal(p.pal); setSt({ ...p.st }); if (p.hs) setHs({ ...p.hs }); };
  useEffect(() => { const h = e => { if (e.key === "Delete" && sel && document.activeElement?.contentEditable !== "true" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") delBlk(sel); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [sel]);
  useEffect(() => { const l = document.createElement("link"); l.href = "https://fonts.googleapis.com/css2?family=Charter:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@400;500;600;700;800&family=Fira+Sans:wght@300;400;500;600;700;800&family=IBM+Plex+Sans:wght@300;400;500;600;700&family=Libre+Franklin:wght@300;400;500;600;700;800&family=Literata:wght@400;500;600;700;800&family=Lora:wght@400;500;600;700&family=Outfit:wght@300;400;500;600;700;800&family=Source+Sans+3:wght@300;400;500;600;700;800&family=Source+Serif+4:wght@400;500;600;700;800&display=swap"; l.rel = "stylesheet"; document.head.appendChild(l); const s = document.createElement("style"); s.textContent = `@media print{body *{visibility:hidden!important}#poster-canvas,#poster-canvas *{visibility:visible!important}#poster-canvas{position:fixed!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important;transform:none!important;box-shadow:none!important}}`; document.head.appendChild(s); }, []);

  return (<div style={{ display: "flex", height: "100vh", width: "100vw", background: "#0a0a12", fontFamily: "'DM Sans',system-ui,sans-serif", overflow: "hidden" }}>
    <Sidebar posterSize={ps} setPosterSize={chgSz} fontFamily={ff} setFontFamily={setFf} palette={pal} setPalette={setPal} showGrid={sg} setShowGrid={setSg} onAddBlock={addBlk} onAutoLayout={autoLayout} auths={auths} setAuths={setAuths} insts={insts} setInsts={setInsts} onApply={apply} styles={st} setStyles={setSt} hs={hs} setHs={setHs} refs={rawRefs} setRefs={setRawRefs} citStyle={citStyle} setCitStyle={setCitStyle} sortMode={sortMode} setSortMode={setSortMode} savedP={svp} onSaveP={saveP} onLoadP={loadP} selectedBlock={selBlock} onUpdate={updBlk} />
    <div ref={cRef} onClick={() => setSel(null)} style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "auto", padding: 30, background: "#0a0a12" }}>
      <div style={{ position: "relative" }}>
        <div style={{ width: cW * zoom, height: cH * zoom, boxShadow: "0 4px 40px rgba(0,0,0,.5)", borderRadius: 3, overflow: "hidden" }}>
          <div id="poster-canvas" style={{ width: cW, height: cH, transform: `scale(${zoom})`, transformOrigin: "top left", background: pal.bg, position: "relative" }}>
            {sg && <svg width={cW} height={cH} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", opacity: 0.03 }}>{Array.from({ length: Math.ceil(cW / 40) + 1 }).map((_, i) => <line key={`v${i}`} x1={i * 40} y1={0} x2={i * 40} y2={cH} stroke={pal.primary} strokeWidth=".5" />)}{Array.from({ length: Math.ceil(cH / 40) + 1 }).map((_, i) => <line key={`h${i}`} x1={0} y1={i * 40} x2={cW} y2={i * 40} stroke={pal.primary} strokeWidth=".5" />)}</svg>}
            {blocks.map(b => <Block key={b.id} block={b} palette={pal} fontFamily={ffc} styles={st} hs={hs} selected={sel === b.id} onSelect={setSel} onPD={onPD} onUpdate={updBlk} onDel={delBlk} auths={auths} insts={insts} refs={refs} citStyle={citStyle} hNum={hCnt[b.id] || 0} />)}
          </div>
        </div>
        <div style={{ textAlign: "center", marginTop: 8, fontSize: 9, color: "#333", fontFamily: "system-ui" }}>{POSTER_SIZES[ps].label} · {ff} · {pal.name}</div>
      </div>
      <ZoomBar zoom={zoom} setZoom={setZoom} />
    </div>
  </div>);
}