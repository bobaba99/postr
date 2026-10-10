/**
 * copyScan — the strings a source file can show a user, read out of its
 * syntax tree, for the copy inventory (src/__tests__/copyInventory.test.ts).
 *
 * What counts as a string: every string literal and template literal (a
 * `+` chain of them read as one string), and every JSX element's own text,
 * its text runs and string children joined in order (another element or an
 * expression in between reads as `{}`), so a sentence the JSX splits over
 * lines is one string. Comments and string literal TYPES (`'latex' |
 * 'pptx'`) are not strings a user sees, and are left out. Import
 * specifiers are kept apart (`kind: 'module'`): they are not copy, but the
 * inventory checks that nothing imports the LaTeX writer outside the
 * switch. Each JSX element whose tag is a component (`<ImportSection />`)
 * is kept too (`kind: 'element'`, its tag name as the text), so the
 * inventory can check where a hidden component is rendered (record 29).
 *
 * `guardedBy` lists the hide switches (HIDE_FLAGS, imported from
 * config/features) a string can only be reached through: inside
 * `FLAG && …`, the true branch of `FLAG ? … : …` or of `if (FLAG)` (the
 * switch as any `&&` conjunct of the condition), or the false branch of a
 * `!FLAG` condition. A local variable of the same name does not count.
 * `guarded` is the LaTeX switch's entry (fix 25). `component` names the
 * nearest enclosing function the string sits in (a declaration, or a
 * function assigned to a `const`), or null at a module's top level.
 *
 * `readSource` is how the inventory reads a file. Under
 * scripts/mutation-check.mjs it returns the mutant's text (the child names
 * the mutated sources in POSTR_MUTANT_SOURCES), so a mutant of a file the
 * inventory reads from disk is seen like one served to an import.
 */
import { readFileSync, realpathSync } from 'node:fs';
import ts from 'typescript';

export const LATEX_FLAG = 'LATEX_EXPORT_ENABLED';
/** The switches whose hidden copy the inventory checks (fix 25: LaTeX; record 29: the minimal editor). */
export const HIDE_FLAGS = [LATEX_FLAG, 'IMPORT_ENABLED', 'ADJUSTMENTS_ENABLED', 'EDITOR_EXTRAS_ENABLED'] as const;
export type HideFlag = (typeof HIDE_FLAGS)[number];

export interface CopyText {
  /** 1-based line of the string's start. */
  readonly line: number;
  /** The string; JSX whitespace collapsed; `{}` for an expression; a component's tag name for an element. */
  readonly text: string;
  /** Reachable only while the LaTeX export is switched on. */
  readonly guarded: boolean;
  /** The hide switches the string can only be reached through. */
  readonly guardedBy: readonly HideFlag[];
  /** The nearest enclosing named function, or null. */
  readonly component: string | null;
  readonly kind: 'string' | 'jsx' | 'module' | 'element';
}

function loadOverlay(): ReadonlyMap<string, string> {
  const file = process.env.POSTR_MUTANT_SOURCES;
  if (!file) return new Map();
  const byPath = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
  return new Map(Object.entries(byPath).map(([p, text]) => [realpathSync(p), text]));
}

const OVERLAY = loadOverlay();

/** A file's text, or a mutant's text under scripts/mutation-check.mjs. */
export function readSource(absPath: string): string {
  return OVERLAY.get(realpathSync(absPath)) ?? readFileSync(absPath, 'utf8');
}

const unwrap = (e: ts.Expression): ts.Expression =>
  ts.isParenthesizedExpression(e) ? unwrap(e.expression) : e;

const isStringPiece = (e: ts.Expression): boolean =>
  ts.isStringLiteralLike(e) || ts.isTemplateExpression(e);

function templateText(t: ts.TemplateExpression): string {
  return t.head.text + t.templateSpans.map((s) => `{}${s.literal.text}`).join('');
}

/** The operands of a `+` chain, left to right. */
function plusOperands(e: ts.Expression): ts.Expression[] {
  const x = unwrap(e);
  return ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.PlusToken
    ? [...plusOperands(x.left), ...plusOperands(x.right)]
    : [x];
}

function pieceText(e: ts.Expression): string {
  if (ts.isStringLiteralLike(e)) return e.text;
  if (ts.isTemplateExpression(e)) return templateText(e);
  return '{}';
}

/** The hide switches this file imports from config/features under their own names. */
function importedFlags(sf: ts.SourceFile): ReadonlySet<string> {
  const out = new Set<string>();
  for (const st of sf.statements) {
    if (
      !ts.isImportDeclaration(st) ||
      !ts.isStringLiteral(st.moduleSpecifier) ||
      !/(^|\/)config\/features$/.test(st.moduleSpecifier.text)
    ) continue;
    const nb = st.importClause?.namedBindings;
    if (!nb || !ts.isNamedImports(nb)) continue;
    for (const el of nb.elements) {
      const name = el.name.text;
      if ((HIDE_FLAGS as readonly string[]).includes(name) && (el.propertyName?.text ?? name) === name) out.add(name);
    }
  }
  return out;
}

type Guards = ReadonlySet<HideFlag>;
const NO_GUARDS: Guards = new Set();
const withFlags = (g: Guards, more: Iterable<HideFlag>): Guards => {
  const next = new Set(g);
  for (const f of more) next.add(f);
  return next.size === g.size ? g : next;
};

/** Every string `fileName`'s source can show, with its line, guards and component. */
export function scanSource(fileName: string, source: string): CopyText[] {
  const scriptKind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);
  const flags = importedFlags(sf);
  const out: CopyText[] = [];

  let component: string | null = null;
  const add = (node: ts.Node, text: string, guards: Guards, kind: CopyText['kind']) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    out.push({ line, text, guarded: guards.has(LATEX_FLAG), guardedBy: [...guards], component, kind });
  };
  const flagOf = (e: ts.Expression): HideFlag | null => {
    const x = unwrap(e);
    return ts.isIdentifier(x) && flags.has(x.text) ? (x.text as HideFlag) : null;
  };
  /** The switches that are `&&` conjuncts of a condition. */
  const conjunctFlags = (e: ts.Expression): HideFlag[] => {
    const x = unwrap(e);
    const f = flagOf(x);
    if (f) return [f];
    if (ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      return [...conjunctFlags(x.left), ...conjunctFlags(x.right)];
    }
    return [];
  };
  /** The switch of a `!FLAG` condition. */
  const negatedFlag = (e: ts.Expression): HideFlag[] => {
    const x = unwrap(e);
    if (ts.isPrefixUnaryExpression(x) && x.operator === ts.SyntaxKind.ExclamationToken) {
      const f = flagOf(x.operand);
      return f ? [f] : [];
    }
    return [];
  };

  function visitJsxChildren(node: ts.JsxElement | ts.JsxFragment, guards: Guards): void {
    const textOf = (child: ts.JsxChild): string | null => {
      if (ts.isJsxText(child)) return child.text;
      if (ts.isJsxExpression(child) && child.expression && ts.isStringLiteralLike(child.expression)) {
        return child.expression.text;
      }
      return null;
    };
    const parts = node.children.map((child) => textOf(child) ?? '{}');
    const hasText = node.children.some(
      (child) => textOf(child) !== null && !(ts.isJsxText(child) && child.containsOnlyTriviaWhiteSpaces),
    );
    if (hasText) add(node, parts.join('').replace(/\s+/g, ' ').trim(), guards, 'jsx');
    for (const child of node.children) {
      if (textOf(child) === null) visit(child, guards);
    }
  }

  const tagIfComponent = (tag: ts.JsxTagNameExpression): string | null =>
    ts.isIdentifier(tag) && /^[A-Z]/.test(tag.text) ? tag.text : null;

  /** The name a function takes from its declaration or from the `const` it is assigned to. */
  const functionName = (node: ts.Node): string | null => {
    if (ts.isFunctionDeclaration(node)) return node.name?.text ?? null;
    if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
      return node.parent.name.text;
    }
    return null;
  };

  function visit(node: ts.Node, guards: Guards): void {
    const fn = functionName(node);
    if (fn) {
      const outer = component;
      component = fn;
      ts.forEachChild(node, (child) => visit(child, guards));
      component = outer;
      return;
    }
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const spec = node.moduleSpecifier;
      if (spec && ts.isStringLiteral(spec)) add(spec, spec.text, guards, 'module');
      return;
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [arg] = node.arguments;
      if (arg && ts.isStringLiteralLike(arg)) add(arg, arg.text, guards, 'module');
      return;
    }
    if (ts.isLiteralTypeNode(node)) return;
    if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind;
      if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
        visit(node.left, guards);
        visit(node.right, withFlags(guards, conjunctFlags(node.left)));
        return;
      }
      if (op === ts.SyntaxKind.PlusToken) {
        const operands = plusOperands(node);
        if (operands.some(isStringPiece)) {
          add(node, operands.map(pieceText).join(''), guards, 'string');
          for (const o of operands) {
            if (ts.isTemplateExpression(o)) o.templateSpans.forEach((s) => visit(s.expression, guards));
            else if (!ts.isStringLiteralLike(o)) visit(o, guards);
          }
          return;
        }
      }
    }
    if (ts.isConditionalExpression(node)) {
      visit(node.condition, guards);
      visit(node.whenTrue, withFlags(guards, conjunctFlags(node.condition)));
      visit(node.whenFalse, withFlags(guards, negatedFlag(node.condition)));
      return;
    }
    if (ts.isIfStatement(node)) {
      visit(node.expression, guards);
      visit(node.thenStatement, withFlags(guards, conjunctFlags(node.expression)));
      if (node.elseStatement) visit(node.elseStatement, withFlags(guards, negatedFlag(node.expression)));
      return;
    }
    if (ts.isJsxElement(node)) {
      const tag = tagIfComponent(node.openingElement.tagName);
      if (tag) add(node, tag, guards, 'element');
      visit(node.openingElement, guards);
      visitJsxChildren(node, guards);
      return;
    }
    if (ts.isJsxSelfClosingElement(node)) {
      const tag = tagIfComponent(node.tagName);
      if (tag) add(node, tag, guards, 'element');
      ts.forEachChild(node, (child) => visit(child, guards));
      return;
    }
    if (ts.isJsxFragment(node)) {
      visitJsxChildren(node, guards);
      return;
    }
    if (ts.isStringLiteralLike(node)) {
      add(node, node.text, guards, 'string');
      return;
    }
    if (ts.isTemplateExpression(node)) {
      add(node, templateText(node), guards, 'string');
      node.templateSpans.forEach((s) => visit(s.expression, guards));
      return;
    }
    ts.forEachChild(node, (child) => visit(child, guards));
  }

  visit(sf, NO_GUARDS);
  return out;
}

/**
 * A claim of the LaTeX export: LaTeX, XeLaTeX, LuaLaTeX, pdfLaTeX, Overleaf,
 * poster.tex. Not `translateX`, whose letters contain "latex".
 */
export const LATEX_CLAIM = /(?:^|[^a-z]|xe|lua|pdf)latex|overleaf|\.tex\b/i;

/**
 * A price: CA$18.99, $9.99, CA$5, 18,99 $, 18.99 CAD. A bare `$0` (the
 * free tier) and `$1` (a regex replacement) are not prices.
 */
export const PRICE = /(?:CA|C|US)\$\s?\d+(?:[.,]\d{2})?|\$\s?\d+[.,]\d{2}\b|\b\d+[.,]\d{2}\s?(?:\$|CAD\b|USD\b)/;

/** Says tax is extra (English or French). */
export const TAX_NOTE = /\btax(?:e|es)?\b/i;

/** How far after a price its tax note may start: "right beside it". */
export const TAX_NOTE_WITHIN = 40;

/**
 * Each price in `text` (whitespace runs read as one space) with the
 * TAX_NOTE_WITHIN characters after it, and whether those say tax is extra.
 * "CA$18.99 term or a CA$9.99 pack, each plus applicable taxes" has a tax
 * note for the second price only.
 */
export function pricesWithTax(text: string): Array<{ price: string; after: string; taxed: boolean }> {
  const flat = text.replace(/\s+/g, ' ');
  return [...flat.matchAll(new RegExp(PRICE.source, 'g'))].map((m) => {
    const end = m.index + m[0].length;
    const after = flat.slice(end, end + TAX_NOTE_WITHIN);
    return { price: m[0], after, taxed: TAX_NOTE.test(after) };
  });
}

/** True when `text` shows a price with no tax note right after it. */
export const hasUntaxedPrice = (text: string): boolean => pricesWithTax(text).some((p) => !p.taxed);

/**
 * A tax note followed straight by a billing period: "CA$18.99 + applicable
 * taxes / 4 months" reads as taxes per 4 months. The period goes before the
 * note ("CA$18.99 every 4 months + applicable taxes"). English or French
 * ("taxes applicables / 4 mois"). Fix 25's review round 1 (B-R1-03).
 */
export const TAX_BEFORE_PERIOD =
  /\btax(?:e|es)?\b(?:\s+applicables?|\s+en\s+sus)?\s*(?:\/|\bper\b|\bevery\b|\beach\b|\bpar\b)\s*(?:\d+[\s-]*)?(?:months?|years?|weeks?|days?|terms?|mois|ans?|semaines?|jours?)\b/i;
