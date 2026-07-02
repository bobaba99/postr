# Postr — Marketing One-Pager

> The academic poster tool for people who hate making academic posters.

[postr.sh](https://www.postr.sh) — free for students, no signup to start, no watermarks, no AI-generated stock-photo aesthetic.

---

## Why this exists

Every researcher uses one of four tools to make a conference poster, and every one of them is the wrong tool for the job:

- **PowerPoint** — invented for slide decks, abused into a print medium. Tables are an Indianapolis-style obstacle course of Pen Style → Pen Weight → Pen Color → Apply per side. Pasting a BibTeX export shreds your references. Author superscripts are pure manual labor that you re-do every time an affiliation changes.
- **Canva** — designed for Instagram posts and birthday invites. You can't pin an image to "exactly 6 inches wide." Fonts are paginated by aesthetic, not legibility. Zero academic primitives — no references, no Greek symbols, no author/affiliation system.
- **Figma** — overqualified, underspecialized. Steep learning curve for non-designers, slow on a 48 × 36″ canvas, web-only on conference-hotel WiFi. Has none of the academic conventions baked in.
- **LaTeX (Beamerposter / tikzposter)** — print-correct but visually punishing. Iterating on layout means recompiling. The output looks like 1998 and your advisor asks why.

Postr is the missing fifth option: **opinionated, web-based, free, and built for academic posters specifically.** Nothing in the editor exists unless it is useful for that one job.

---

## Five things no competitor does

These are the differentiators worth leading with in any promo.

### 1. Round-trip PDF & image import → fully editable blocks

Drop a PDF or PNG of an existing poster — yours, your PI's, last year's group conference template — and Postr reconstructs it as **editable blocks**. Title, headings, body text, figures, all positioned where they were, all individually clickable and editable.

- **PDF path** uses `pdfjs-dist` to extract real text streams + image XObjects with their original coordinates. No OCR loss for text-native PDFs.
- **Image path** routes through a vision LLM endpoint that returns a structured block layout, not just a stylesheet.
- **Auto-arrange** re-flows the imported result onto Postr's grid in one click.
- **Image readability OCR** scans every figure for tiny axis labels and tells you *before the print shop* which figures will be unreadable from 3 feet away.

No other poster tool does PDF → editable. Canva and Figma can place a PDF as a flat image; PowerPoint can't even do that without losing fidelity. This single feature collapses the "I already have a poster, I just want to refresh it" workflow from 90 minutes of re-typing to 30 seconds of upload.

### 2. Slash-command Greek symbols and stats glyphs

Type `/alpha`, get `α`. `/Delta` → `Δ`. `/sigma` → `σ`. `/chi2` → `χ²`. `/eta2` → `η²`. `/p` → italic Unicode `𝑝`.

Roughly 70 symbols cover lowercase Greek, uppercase Greek, math operators (±, ×, ≤, ≈, ∞, °, √, ∑, ∫), arrows, and the italic-math Unicode glyphs that journals demand for *p*, *F*, *t*, *r*, *N*, *M*, etc.

The competing flow in PowerPoint: Insert → Symbol → font dropdown → scroll → click → close → repeat for the next letter. In Canva: not natively supported. In Postr: type a slash.

### 3. Structured authors & institutions with auto-cascading superscripts

You define institutions once. You assign each author to one or more institutions by clicking a numbered chip. Postr generates the superscripts, deduplicates them, and **renumbers automatically** when you add, remove, or reorder anything.

The competing flow: type `¹` after an author's name, type `¹` before the institution, manually keep them in sync forever, redo the entire numbering when your co-author adds a second affiliation.

Multi-affiliation, equal-contribution markers (`*`), and corresponding-author markers (`†`) are first-class fields, not parenthetical notes you append by hand.

### 4. Reference manager with BibTeX / RIS / EndNote import + 4 citation styles

Drop a `.bib`, `.ris`, or `.enw` file. References parse into structured records (authors, year, title, journal, DOI). Pick a style — APA 7, Vancouver, IEEE, or Harvard — and the references block re-formats live.

Sort manually, alphabetically, or by year. Switch citation styles for a journal that wants Vancouver instead of APA in **one click**. No competitor in this space has anything resembling this. PowerPoint pastes references as raw text and destroys the formatting. Canva has no reference primitive at all.

### 5. AI style scan — extract a preset from any poster

Upload a photo, screenshot, or PDF of a poster you like. Claude Sonnet 4.6 with vision returns a structured preset: closest-match font from Postr's curated 10, a print-safe palette, type-style ratios for title / heading / authors / body, heading border treatment, and a layout hint. Save the preset, apply it to your draft.

This is the inverse of "import poster and edit" — it's "match the *style* of this poster" and ship it as a reusable preset for the rest of your lab.

---

## The convenience layer

Differentiation isn't only about features no one else has. A lot of Postr's leverage comes from removing the *small* daily frictions that the dominant tools accumulate.

| Friction | PowerPoint / Canva / Figma | Postr |
|---|---|---|
| Open the tool | Boot Office, open template, fight with paste | Open `postr.sh`, start typing |
| First save | Manual, Ctrl-S, name the file | Autosave from first keystroke; account-less |
| Sign up to keep work | Required up-front | Anonymous-first; convert later, **all drafts persist** |
| Resize an image to "exactly 6 inches" | Approximate by eye | Type a number |
| Change all your accent colors | 50 manual edits | Pick a different palette — one click |
| Add a delete-cascading institution | Renumber every author by hand | Edit institution; superscripts re-cascade |
| Insert your university logo | Google → Wikipedia → save → insert | Insert → Logo → search institution → done |
| Crop a figure inside a block | Open Photoshop / re-export | Inline crop overlay with keyboard commit |
| Check if your axis labels print | Pay for the print, find out at the conference | Image readability OCR flags it before export |
| Verify conference compliance | Cross-tab between guidelines PDF and editor | Paste guidelines → automatic pass/fail panel |
| Reset to "fit to viewport" | Manual zoom math | One key |
| Undo a layout disaster | Ctrl-Z, hope | Undo toast + auto-arrange fallback |
| Print | Export PDF, fight DPI, fight color, reprint | Browser-native print at full DPI; pre-flight checks |

Each row is a small thing. Stacked across the few days a researcher spends on a poster, they're the difference between "fun project Friday afternoon" and "it's 2 a.m. and I hate this."

---

## Feature comparison snapshot

| Feature | PowerPoint | Canva | Figma | LaTeX | **Postr** |
|---|---|---|---|---|---|
| Anonymous start, autosave | ❌ | Account required | Account required | N/A | ✅ |
| Curated academic fonts | ❌ | Overwhelming list | Overwhelming list | Manual setup | ✅ 10 vetted families |
| Print-safe color palettes | ❌ | Marketing-themed | Designer-themed | Manual | ✅ 8 academic palettes |
| Author/institution superscript sync | ❌ Manual | ❌ Manual | ❌ Manual | Yes (compile) | ✅ Live cascade |
| Reference manager + citation styles | ❌ | ❌ | ❌ | ✅ via BibLaTeX | ✅ APA / Vancouver / IEEE / Harvard |
| BibTeX / RIS / EndNote import | ❌ | ❌ | ❌ | ✅ | ✅ |
| Greek / math shortcuts | Insert → Symbol | Not native | Unicode hunt | `\alpha` | ✅ `/alpha` |
| Auto-layout / column reflow | ❌ | ❌ | Manual | Macro | ✅ One click |
| AI scan to extract style preset | ❌ | ❌ | ❌ | ❌ | ✅ |
| PDF → editable block import | ❌ | Image-only | Image-only | ❌ | ✅ |
| Image OCR readability check | ❌ | ❌ | ❌ | ❌ | ✅ |
| Inline image cropping | ❌ basic | Basic | Yes | ❌ | ✅ |
| Conference guidelines pass/fail panel | ❌ | ❌ | ❌ | ❌ | ✅ |
| Inline comments for advisor review | ❌ | Limited | Yes | ❌ | ✅ |
| Public academic poster gallery | ❌ | Marketing only | Designer files | ❌ | ✅ |
| Real-time autosave | ❌ | ✅ | ✅ | ❌ | ✅ |
| Print-safe export at 300 DPI | Brittle | Brittle | Brittle | ✅ | ✅ |
| Zero-cost for students | ❌ | Free tier limited | Free tier limited | ✅ | ✅ |

---

## Headline angles for promotion

Pick one per channel; don't try to communicate all of them at once.

- **"Drop a PDF, get an editable poster."** Lead with the reverse-import demo. It's the most visceral 15-second video.
- **"It's 2026. Stop typing superscripts by hand."** Lead with the author/institution cascade. Instantly recognizable to anyone who has ever made a poster.
- **"Type `/alpha`. Get α."** Lead with slash commands. Works as a sub-30-second short.
- **"Your axis labels are too small. Postr told us before you printed."** Lead with image readability OCR. Saves people money, which is more memorable than saving them time.
- **"No signup. No watermark. No 'Pro' tier between you and a working poster."** Lead with the free / anonymous-first principle. Aimed at the student-budget audience.

---

## Who Postr is for

- **Undergraduate and graduate students** preparing their first conference poster, with no design background and no institutional template they trust.
- **Postdocs and PIs** who have made twenty posters and want the next one to take an evening, not a weekend.
- **Lab managers** who maintain a shared author/institution/reference library across the group's posters.
- **Conference organizers** who want to point first-time presenters at one tool and trust the output to be print-ready.

If you're designing a marketing poster, an event flyer, or a movie premiere announcement — use Canva. If you're presenting research, use Postr.

---

## Status

Pre-launch. The editor, anonymous-first auth, autosave, references, authors, scan, reverse-import, readability OCR, and gallery are live in production at [postr.sh](https://www.postr.sh). Free, no waitlist, no credit card.

Feedback to [@postr_sh](https://twitter.com/) on X, or open an issue at the GitHub repo.
