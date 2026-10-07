// Probe (reviser pass 2026-10-07): which ordinary typed strings would the slash
// menu turn into a symbol if the user then presses Enter? Uses the production
// matcher (slashCommand.ts) and filter (symbols.ts) exactly as RichTextEditor's
// Enter/Tab branch calls them (filterSymbols(prefix, 1)[0]). Read-only.
// Run: cd apps/web && npx tsx ../../docs/launch/mvp-editor/probes/revise-probe-slash.mts
import { matchSlashAtCaret } from '../../../../apps/web/src/poster/slashCommand.ts';
import { filterSymbols } from '../../../../apps/web/src/poster/symbols.ts';
const typed = ['n/a', 'w/', 'and/or', 'mg/kg', 'μg/d', '24/7', 'p < .05/3', 'km/h', 'Smith/Jones', 'see Fig. 2/', 'end of sentence'];
for (const t of typed) {
  const m = matchSlashAtCaret(t);
  const first = m ? filterSymbols(m.prefix, 1)[0] : undefined;
  console.log(`${JSON.stringify(t).padEnd(20)} menu open: ${m ? 'yes' : 'no '}  Enter inserts: ${first ? `${first[1]} (/${first[0]}) -> "${m!.before}${first[1]}"` : '(nothing; Enter is a new line)'}`);
}
