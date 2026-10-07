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
 * switch.
 *
 * `guarded` marks a string the app can only reach while the LaTeX export
 * is switched on: inside `LATEX_EXPORT_ENABLED && …`, the true branch of
 * `LATEX_EXPORT_ENABLED ? … : …` or of `if (LATEX_EXPORT_ENABLED)` (the
 * switch as any `&&` conjunct of the condition), or the false branch of a
 * `!LATEX_EXPORT_ENABLED` condition. Only the switch imported from
 * config/features counts: a local variable of the same name does not.
 *
 * `readSource` is how the inventory reads a file. Under
 * scripts/mutation-check.mjs it returns the mutant's text (the child names
 * the mutated sources in POSTR_MUTANT_SOURCES), so a mutant of a file the
 * inventory reads from disk is seen like one served to an import.
 */
import { readFileSync, realpathSync } from 'node:fs';
import ts from 'typescript';

export const LATEX_FLAG = 'LATEX_EXPORT_ENABLED';

export interface CopyText {
  /** 1-based line of the string's start. */
  readonly line: number;
  /** The string; JSX whitespace collapsed; `{}` for an expression. */
  readonly text: string;
  /** Reachable only while the LaTeX export is switched on. */
  readonly guarded: boolean;
  readonly kind: 'string' | 'jsx' | 'module';
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

function importsFlag(sf: ts.SourceFile): boolean {
  return sf.statements.some(
    (st) =>
      ts.isImportDeclaration(st) &&
      ts.isStringLiteral(st.moduleSpecifier) &&
      /(^|\/)config\/features$/.test(st.moduleSpecifier.text) &&
      !!st.importClause?.namedBindings &&
      ts.isNamedImports(st.importClause.namedBindings) &&
      st.importClause.namedBindings.elements.some(
        (el) => el.name.text === LATEX_FLAG && (el.propertyName?.text ?? LATEX_FLAG) === LATEX_FLAG,
      ),
  );
}

/** Every string `fileName`'s source can show, with its line and guard. */
export function scanSource(fileName: string, source: string): CopyText[] {
  const scriptKind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);
  const flagImported = importsFlag(sf);
  const out: CopyText[] = [];

  const add = (node: ts.Node, text: string, guarded: boolean, kind: CopyText['kind']) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    out.push({ line, text, guarded, kind });
  };
  const isFlag = (e: ts.Expression): boolean => {
    const x = unwrap(e);
    return flagImported && ts.isIdentifier(x) && x.text === LATEX_FLAG;
  };
  const hasFlagConjunct = (e: ts.Expression): boolean => {
    const x = unwrap(e);
    if (isFlag(x)) return true;
    return (
      ts.isBinaryExpression(x) &&
      x.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      (hasFlagConjunct(x.left) || hasFlagConjunct(x.right))
    );
  };
  const isNegatedFlag = (e: ts.Expression): boolean => {
    const x = unwrap(e);
    return (
      ts.isPrefixUnaryExpression(x) &&
      x.operator === ts.SyntaxKind.ExclamationToken &&
      isFlag(x.operand)
    );
  };

  function visitJsxChildren(node: ts.JsxElement | ts.JsxFragment, guarded: boolean): void {
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
    if (hasText) add(node, parts.join('').replace(/\s+/g, ' ').trim(), guarded, 'jsx');
    for (const child of node.children) {
      if (textOf(child) === null) visit(child, guarded);
    }
  }

  function visit(node: ts.Node, guarded: boolean): void {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const spec = node.moduleSpecifier;
      if (spec && ts.isStringLiteral(spec)) add(spec, spec.text, guarded, 'module');
      return;
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [arg] = node.arguments;
      if (arg && ts.isStringLiteralLike(arg)) add(arg, arg.text, guarded, 'module');
      return;
    }
    if (ts.isLiteralTypeNode(node)) return;
    if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind;
      if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
        visit(node.left, guarded);
        visit(node.right, guarded || hasFlagConjunct(node.left));
        return;
      }
      if (op === ts.SyntaxKind.PlusToken) {
        const operands = plusOperands(node);
        if (operands.some(isStringPiece)) {
          add(node, operands.map(pieceText).join(''), guarded, 'string');
          for (const o of operands) {
            if (ts.isTemplateExpression(o)) o.templateSpans.forEach((s) => visit(s.expression, guarded));
            else if (!ts.isStringLiteralLike(o)) visit(o, guarded);
          }
          return;
        }
      }
    }
    if (ts.isConditionalExpression(node)) {
      visit(node.condition, guarded);
      visit(node.whenTrue, guarded || hasFlagConjunct(node.condition));
      visit(node.whenFalse, guarded || isNegatedFlag(node.condition));
      return;
    }
    if (ts.isIfStatement(node)) {
      visit(node.expression, guarded);
      visit(node.thenStatement, guarded || hasFlagConjunct(node.expression));
      if (node.elseStatement) visit(node.elseStatement, guarded || isNegatedFlag(node.expression));
      return;
    }
    if (ts.isJsxElement(node)) {
      visit(node.openingElement, guarded);
      visitJsxChildren(node, guarded);
      return;
    }
    if (ts.isJsxFragment(node)) {
      visitJsxChildren(node, guarded);
      return;
    }
    if (ts.isStringLiteralLike(node)) {
      add(node, node.text, guarded, 'string');
      return;
    }
    if (ts.isTemplateExpression(node)) {
      add(node, templateText(node), guarded, 'string');
      node.templateSpans.forEach((s) => visit(s.expression, guarded));
      return;
    }
    ts.forEachChild(node, (child) => visit(child, guarded));
  }

  visit(sf, false);
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
