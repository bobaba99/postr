#!/usr/bin/env node
/**
 * keep-work-check.mjs — real-browser check that the user's work is kept
 * (record docs/fixes/27-keep-work-safe.md; docs/launch/mvp-editor/
 * bounded-designs.md §3.9 and §5.1 blockers 1, 2 and 11; open-findings
 * OF-01 and OF-05; plan item 8).
 *
 * Every scenario enters where a user does: a fresh browser opens the editor
 * link /p/new (a signed-in term holder: not a guest, whose own leave prompt
 * arms on every edit, and allowed the PowerPoint export), types with the
 * real keyboard, presses ⌘S / Ctrl+S, reloads, opens the dashboard, Save
 * PDF and Export. The backend is faked at the network
 * (lib/guestBackend.mjs: the posters table with its row-level security, the
 * poster_versions table with its 30-version cap, and its fault injection);
 * nothing in the app is stubbed. Scenarios: lib/keepWorkEnter.mjs (Enter),
 * lib/keepWorkSave.mjs (saving and ⌘S), lib/keepWorkElsewhere.mjs (the
 * poster saved elsewhere meanwhile, the session ended),
 * lib/keepWorkLimits.mjs (limits the fix leaves: a paste into a table
 * cell, an outage during a token refresh, a size field's draft, Enter in an
 * emptied Poster name field), lib/keepWorkLeave.mjs (record 38,
 * docs/fixes/38-save-on-leave.md: the editor left right after an edit) and
 * lib/keepWorkLeaveRound1.mjs (its review round 1's cells),
 * lib/keepWorkLeaveRound2.mjs and lib/keepWorkLeaveRound2Paths.mjs (its
 * review round 2's cells), lib/keepWorkLeaveRound3.mjs (its review round
 * 3's), lib/keepWorkTextEdit.mjs (record 39, text editing like PowerPoint:
 * the format bar's x² and x₂, PowerPoint's superscript and subscript keys,
 * sub- and superscript kept everywhere, the "/" symbol menu; `--only TE`);
 * helpers lib/keepWorkKit.mjs.
 *
 * CLAIMS (a claim is OBSERVED when the defect is present)
 *   E1   " ZQA", Enter, "ZQB" in a text block: the stored text has no line
 *        break between the words
 *   E1r  after a reload the canvas draws ZQB on ZQA's line
 *   E2   the dashboard's Duplicate: the copy's stored text has no break, or
 *        the copy opened in the editor draws the words on one line
 *   E3   Save PDF after the reload: the print window draws them on one line
 *   E4   Export › PowerPoint after the reload: the words share a paragraph
 *        with no line break between them
 *   E5   the same typed in Edit block › Content box: no break stored
 *   E5r  after a reload, on one line on the canvas
 *   E6   " ZQG", Enter, "ZQH", Enter, Enter, "ZQK": after a reload the gap
 *        ZQH→ZQK is under 1.5 times the gap ZQG→ZQH (the blank line lost)
 *   E7   Enter in the title or a heading (one line by design) puts a line
 *        break into it (a guard: clean before and after)
 *   E8   " ZQE", Enter, "ZQF" in a table cell: no line break stored (the
 *        cell keeps its HTML as typed, so a <div> counts as no break)
 *   E8r  after a reload the cell draws them on one line
 *   E8p  Save PDF after the reload: the print window draws them on one line
 *   E8x  the PowerPoint file joins them or writes the markup out as text
 *   S1   the backend refuses every save for 9 s (network failure) while
 *        " ZQNET" waits, then accepts again: the word is not stored within
 *        35 s with nothing more typed (no retry)
 *   S2   2 s into the failure the pill does not read "Not saved — retrying…"
 *   S3   after recovery the word is not stored or the pill does not read
 *        "Saved…"
 *   S6 S6p S6a  the same three for a refused save (403 permission denied),
 *        recovery after 4 s
 *   S4   with a save failed and nothing more typed, closing the tab shows no
 *        leave warning
 *   S4c  with everything stored, closing the tab shows a leave warning (a
 *        false alarm; a guard)
 *   S5   offline (the browser's own switch) while " ZQOFF" waits, back
 *        online after 3.4 s: the word is not stored within 1.5 s of coming
 *        back
 *   S7   " ZQX1" and " ZQX2" typed while every save fails, then the backend
 *        accepts: both words are not stored within 20 s
 *   S8   the first save takes 2.5 s; " ZQR1", 1.2 s, " ZQR2": the stored
 *        poster ends without ZQR2 (the slow first save landed last)
 *   D1   a save failed, then the sidebar's Duplicate: a copy is made that
 *        lacks the unsaved word
 *   K1   ⌘S makes a version
 *   K2   ⌘S pressed right after typing: the word is written more than
 *        400 ms after the key (the key did not save now)
 *   K3   ⌘S does not show "Saved"
 *   K5   the ⌘S keydown is not cancelled (the browser's save dialog would
 *        open; a guard)
 *   K4   one version saved from the Versions tab, then ⌘S 31 times: 30
 *        versions or more are stored, or Restore of that version fails
 *   K6   ⌘S while saves fail: the page says "Saved" while the word is not
 *        stored (a guard)
 *   K7   (over the run) a version is made in a scenario that never pressed
 *        ⌘S, Save version or Restore (a version made silently; a guard)
 *   E9   " ZQI", Enter, two spaces, "ZQJ": the two spaces are not stored
 *        before ZQJ (a new line's leading spaces lost; a guard)
 *   E10  " ZQL1" made a list with the selection toolbar's "•", Enter, "ZQL2",
 *        Enter twice (out of the list), "ZQL3": after a reload the gap from
 *        ZQL2 to ZQL3 differs by more than 0.3 glyph heights from the gap
 *        while typing (a blank line added or lost), or the list is not
 *        stored (added after the fix's first version gained a blank line
 *        here)
 *   E11  the first table selected, Edit block › Table Note: "ZQN1", Enter,
 *        "ZQN2": no line break stored (E11), or the canvas draws them on one
 *        line while typing (E11t) or after a reload (E11r), or the print
 *        window does (E11p), or PowerPoint joins them (E11x) (review round 1,
 *        R1-A1)
 *   S9   the editor opened, a sidebar tab clicked (a user gesture that edits
 *        nothing: a browser warns only a page the user has touched), the tab
 *        closed 3 s later: a leave warning shown, or a save sent with nothing
 *        changed (review round 1, R1-A7: React's StrictMode remount on this
 *        dev server)
 *   E12  Shift+Enter beside Enter: in the first text block " ZQSA",
 *        Shift+Enter, Enter, "ZQSB"; after a reload the gap between them
 *        differs by more than 0.3 glyph heights from the gap while typing (a
 *        blank line added or lost); E12p the same in the print window (and
 *        the second block's gaps); E12b in the second text block " ZQSC",
 *        Shift+Enter, "ZQSD", Enter, "ZQSE": a gap differs after a reload;
 *        E12c the same in the first table cell (" ZQSF" … "ZQSH"); E12x the
 *        PowerPoint file holds a different number of blank lines between two
 *        of these words than were drawn while typing (review round 2, R2-A1)
 *   K8   Layout › Poster name: select all, "ZQK8 name", ⌘S: the name is not
 *        stored 1.5 s later, or the page does not say "Saved" (review round
 *        2, R2-A4: the name is a draft until Enter or its Save button)
 *   K9   every save fails (network); Layout › Poster name: "ZQK9 name",
 *        Enter: 1.5 s later the field's button says "✓ Saved" while the name
 *        is not stored; K9r the backend accepts again, its next write held
 *        3 s: the button says "✓ Saved" (read every 100 ms) before the name
 *        is stored; K9a the name not stored within 15 s, or then the button
 *        does not say "✓ Saved" or the pill "Saved…" (a guard). From the
 *        runs of the first review round 3 (fix 27, section 9)
 *   K10  Layout › Poster name: "ZQK10 name", Enter, while the server holds
 *        the name's first write 4 s and then fails it (network): the button
 *        says "✓ Saved" (read every 100 ms) while that write is out; K10a
 *        the backend accepts again 1 s after the failure: the name not
 *        stored within 20 s, or then the button does not say "✓ Saved" or
 *        the pill "Saved…" (a guard). Round 1 of the restarted review,
 *        N1-F1 (fix 27, section 9)
 *   K11  " ZQK11" typed and stored, then every save fails (network), then
 *        the sidebar's Duplicate: with nothing unsaved, the page says "not
 *        saved" (its message or the pill) or warns before leaving; K11n the
 *        same with Enter in Layout › Poster name, the name unchanged (the
 *        field's button counts: "Save" there says the name is not stored).
 *        Round 2 of the restarted review, N2-F3 (fix 27, section 9)
 *   L1   (record 38, lib/keepWorkLeave.mjs; one scenario per edit and way,
 *        L1-<edit>-<way>) an edit made, then the editor left at once (within
 *        a few ms of the last key or click, inside the save's 800 ms wait):
 *        the edit is not stored 3 s later. Edits: type (a word typed), nudge
 *        (the references block selected, →), aplus (the top bar's A+),
 *        paste (a line pasted, a page-made paste event). Ways: close (the
 *        tab closed, its leave dialog accepted), reload, back (the browser's
 *        Back to the page before), link (the sidebar's "Back to My
 *        Posters", a full page load), address (another address opened),
 *        inapp (Back inside the app to the dashboard: the editor unmounts).
 *        L0 the edit lost with no leave dialog; L5 (close only, where every
 *        engine shows the dialog) no dialog while the change was unsaved
 *   L4   the first save held 2.5 s; " ZQSA", 1 s, " ZQSB", the tab closed at
 *        once (and the same leaving by another address, ZQSC/ZQSD): a write
 *        without the newer word stored after one with it (an older poster
 *        over a newer one); L4d the newer word lost with no dialog
 *   L4s  every save held 2 s; " ZQSE", the tab close asked and the dialog
 *        dismissed (Stay), " ZQSF" 300 ms later: ZQSF not stored 6 s later,
 *        or a write sent while another was held (two in flight)
 *   LF   every save fails while " ZQFR" waits; 3.5 s later the backend
 *        accepts again and the tab is closed at once: the word not stored
 *   LFd  the backend still failing when the tab is closed: the word lost
 *        with no dialog
 *   L2   a poster whose save is over the 64 KiB keepalive limit (11,000
 *        words pasted and stored), " ZQBIG", the tab closed at once: lost
 *        with no dialog
 *   L3c  " ZQIC" typed, Back inside the app to the dashboard, the tab
 *        closed at once: the word neither stored nor sent, before the
 *        close, by a request that outlives the page (keepalive; the page's
 *        own record of its writes, which Playwright misses when the page
 *        closes a moment later); the editor's dialog went with it, so the
 *        loss is silent
 *   L3f  (record 38's review round 1, R1-1; every L3-inapp-* below goes
 *        Back inside the app to the dashboard) every save fails while
 *        " ZQFI" waits, Back at 3 s, the backend back 1 s later, the tab
 *        kept: ZQFI not stored within 40 s (the editor's retries went with
 *        it); L3fd the same, the tab closed while still failing: lost with
 *        no dialog; L3fr closed just as the backend is back: not stored;
 *        L3r the poster opened again from its card while still failing: its
 *        sheet lacks the word; L3rs a word typed there, the backend back:
 *        both not stored within 15 s; L3ro a write without the new word
 *        applied after one with it
 *   L3sd the first save held 3 s, " ZQRA", 1 s, " ZQRB", Back, the tab
 *        closed 300 ms later: ZQRB lost with no dialog; L3sk the same, the
 *        tab kept 6 s: ZQRD not stored
 *   L4 (slow next page)  L4-slow-write-then-slow-address: the first save
 *        held 5 s, " ZQNA", 1 s, " ZQNB", an address answering after 4 s:
 *        older over newer (R1-2); L4-slow-write-then-204-close: the
 *        address answers 204 (the page stays), the pill read at 8 s, the
 *        tab closed: older over newer, L4p the pill "Saved" while ZQND is
 *        not stored, L4q ZQND lost with no dialog at the close
 *   L1o  the first save held 2 s, " ZQPA", 1 s, " ZQPB", 900 ms (its save
 *        waiting), an address answering after 4 s: ZQPB written by an
 *        ordinary request after the page began to go (R1-3)
 *   L1t  a 100 s token refreshed by the client (40 s idle), " ZQTK", the
 *        tab closed: not stored, or the leave's write without the token the
 *        client holds then (R1-7, a guard)
 *   L4 (traced, record 38's review round 2, lib/keepWorkLeaveRound2.mjs)
 *        L4-slow-write-then-edit-<way>-traced: the first save held 2.5 s,
 *        " ZQWC", 1 s, " ZQWD", at once each unloading way (the page's own
 *        trace of its writes and leave events printed): older over newer
 *        (R2-1: WebKit's Back cuts the held write before beforeunload);
 *        L4-slow-write-then-own-save-<way>-traced: the same with ZQWF's own
 *        save up and waiting on the held write (900 ms) when the page is
 *        left; L4d the newer word lost with no dialog
 *   LKa  every save held 2 s; a word, the tab close asked while its write is
 *        out and Stay answered (LKa-stay-then-later), or the tab hidden and
 *        shown again (LKa-hidden-then-later); 4 s; another word: its
 *        ordinary save sent with keepalive (R2-3: the leave's ask outlived
 *        the leave); LKe the same ask, then the token expired while the
 *        client's refresh is out: the pill showed "Not saved" for a save
 *        the client's own request would have waited out
 *   LRr  the first save held 3 s, the next 4 s; " ZQRR1", 1 s, " ZQRR2", Back
 *        inside the app; at 4 s the poster opened again from its card, its
 *        load answered with the row as it was when the load arrived,
 *        delivered just after the kept write is stored
 *        (L3-inapp-reopen-race; L3-inapp-reopen-natural, the load answered
 *        at once, its control): the sheet lacks ZQRR2; LRo the stored
 *        poster at the end lacks it (R2-2)
 *   LDr  every save refused (500), " ZQDL", Back inside the app, the poster
 *        deleted from its dashboard card, saves accepted again: two or more
 *        writes of it after the delete (L3-inapp-kept-then-delete); LDd
 *        closing the tab then still asks to leave (R2-4)
 *   L1s / LF / LB / L1x / L3x / LG / L2 / LH  (lib/keepWorkLeaveRound2Paths.mjs,
 *        the round's partition of entry paths) L1s-<nudge|aplus>-<way>: the
 *        nudge or A+ read from the stored row, so it runs on the build (L1,
 *        L0 as above); LF-failed-then-recovered-<way> and
 *        LF-still-failing-<way>: LF and LFd by reload, Back, a link and an
 *        address; LB-bfcache-*: Back then Forward with bfcache on (full
 *        Chromium; Firefox and WebKit restore no page under Playwright): LB1
 *        a change not stored, LB2 one typed after Forward not stored with
 *        "Saved", LBo older over newer, LBh nothing written after Forward;
 *        L1x-expired-token-close: the token expired, the refresh held, the
 *        tab closed: lost with no dialog (L0); L3x-expired-token-inapp: the
 *        same, Back inside the app, the refresh answered 3 s later: not
 *        stored within 20 s; LG-guest-*: an anonymous session (L1, L0);
 *        L2-near-limit-<bytes>-<way>: a save of about that size, a word, at
 *        once the way out (over the app's 61,440-byte cap only L0 counts:
 *        the dialog is the protection, L2's rule); LH-hidden-synthetic: a
 *        synthetic hidden tab, the word not stored 430 ms later
 *   LW / L4-cut / L4-gap / L4-slow-past-settle  (lib/keepWorkLeaveRound3.mjs,
 *        record 38's review round 3) LW-500-close-<ms>: the first save
 *        answered 500 by the server (nothing stored), the tab closed <ms>
 *        later: WL the word not stored (R3-1: a server's answer counted as
 *        the browser's cut); LW-net-close-400 the same with no answer, past
 *        the 200 ms; LW-500-stay-60, LW-held500-stay: WS not stored within
 *        3 s of Stay; LW-waiting-save-500: LWw a save waiting on a write the
 *        server answered 500 held 150 ms or more; L4-cut-then-debounce-
 *        <close|address|back>: the held save failed to the page with no
 *        answer while the server applies it 1.5 s later, the newer change's
 *        own 800 ms wait firing 80 ms after the failure, the page left 130 ms
 *        after it: L4 older over newer, L4d lost with no dialog (R3-2,
 *        without the race); L4-gap-<d> (KEEP_WORK_GAP, e.g. 766-786): the
 *        reviewer's WebKit sweep of the same race by the browser's Back;
 *        L4-slow-past-settle-ps: a next page slower than the 10 s settle: L4
 *
 * TEXT EDITING (record 39, docs/fixes/39-text-editing.md; lib/keepWorkTextEdit.mjs)
 *   TE1  " ZQH2O" typed in text block 1, the "2" selected with Shift + ←:
 *        the format bar's buttons are not B, I, U, x², x₂, •, 1., Clear in
 *        that order; TE1a x² clicked: "ZQH<sup>2</sup>O" not stored; TE1s
 *        x² not pressed or x₂ pressed then; TE1u one ⌘Z does not take the
 *        superscript away and keep the word (stored and drawn); TE1r ⌘⇧Z
 *        does not put it back; TE1t x² again does not remove it; TE1x x²
 *        then x₂ does not leave subscript only; TE1xs the bar not saying so
 *   TE1l "ZQL1" made a bulleted line with "•" and selected: • not pressed
 *        or 1. pressed; TE1b B pressed on it, B not shown pressed
 *   TE2  " ZQK2O", the "2" selected: Control + Shift + = does not store
 *        superscript; TE2p its keydown not cancelled in text; TE2u one ⌘Z
 *        does not undo it; TE2t the key twice more not on then off; TE2b
 *        Control + = not subscript; TE2m ⌘ + Control + Shift + = (Microsoft's
 *        Mac table) not superscript; TE2o outside text (the workspace
 *        clicked) the keys cancelled or the poster changed; TE2z ⌘ + = (the
 *        Mac browsers' zoom) cancelled in text (on a macOS host)
 *   TE2w navigator.platform "Win32": Ctrl + Shift + = and Ctrl + = not
 *        superscript / subscript, or ⌘ + Control + Shift + = taken; TE2wt the
 *        x² / x₂ titles not "Superscript (Ctrl+Shift+=)", "Subscript (Ctrl+=)"
 *   TE3a " ZQH2O ZQCO2 ZQEND" with the "2"s made x² and x₂ on the bar, then
 *        " ZQMORE" typed at the end: both not stored; TE3r not drawn after a
 *        reload; TE3p in the print window (Save PDF) the "2"s not raised /
 *        lowered (their glyph centres against the letter before, over
 *        -0.1 em / under +0.05 em); TE3x the PowerPoint file's "2" runs
 *        without a positive / negative baseline; TE3c "ZQH2O" copied with
 *        the engine's ⌘C into text block 2 with ⌘V: no superscript stored
 *   TE3s… the same five (TE3sa … TE3sc) with the sub- and superscript put
 *        there by a paste of another application's HTML (no bar needed)
 *   TE4w each of "n/a", "mg/kg", "w/", "μg/d", "see Fig. 2/", "and/or",
 *        "24/7", "km/h" typed on its own line, then Enter: a line not stored
 *        as typed; TE4wm the menu open before an Enter
 *   TE4n "/" at the block's start: the menu not open with every symbol
 *        (symbols.ts holds 65); TE4h the first entry not highlighted, or ↓
 *        not moving it to the second; TE4x Esc: the menu still open, the
 *        caret out of the block or the text changed; TE4e "/al", Enter (no
 *        arrow): the menu still open, or the line not stored as "/al";
 *        TE4s "x /a": no menu after a space; TE4k ↓ then Enter not inserting
 *        the second entry (≈); TE4l no menu at a line start; TE4t Tab not
 *        inserting α; TE4c a click on √ not inserting it
 *   TE4j "ZQJ1", Enter, "/al", Tab, " ZQJ2": not stored as two lines
 *        "ZQJ1" and "α ZQJ2" (the symbol joined the lines on main)
 *   TE4ti the title: "ZQT /al" (menu open), Enter: the menu still open, or
 *        the title not "ZQT /al" (a symbol or a line break added)
 *   From record 39's review round 1 (section 9):
 *   TE3i " ZQH2O ZQC2X ZQBOLDY" with x², x₂ and B from the bar; ONLY the
 *        superscript "2" copied with ⌘C, pasted with ⌘V into text block 2:
 *        no superscript stored (R1-F1); TE3ib the same for the subscript
 *        "2"; TE3ik for "OL" of the bold word (a guard: the engines keep
 *        it); TE3ix the superscript "2" cut with ⌘X: not removed; TE3ixu one
 *        ⌘Z not putting it back, or ⌘⇧Z not taking it again; TE3ixp its ⌘V:
 *        no superscript stored
 *   TE4jb "ZQB1", Enter, "ZQB2", Shift + Enter, "/al", Tab, " ZQBE": not the
 *        lines "ZQB1", "ZQB2", "α ZQBE" (R1-F2: Firefox deleted the line
 *        break); TE4ju the third line after Tab, one ⌘Z and one ⌘⇧Z not "α",
 *        "/al", "α"; TE4jl a bulleted line, Shift + Enter, "/al", Tab,
 *        " ZQLE": not the lines "ZQL1" and "α ZQLE" in the list
 *   TE2n a "2" selected, Control + the numeric keypad's + and Control +
 *        Shift + it: a keydown cancelled, or the text changed (R1-F3)
 *   TE4b a 1440 × 600 window, " /" at the end of the lowest text block, ↑:
 *        the menu or its highlighted entry drawn outside the window (R1-F5)
 *   TE4m " /a" typed at the start of a two-line block, Shift + ↓: the menu
 *        still open over the selection it made, or Tab then inserting a
 *        symbol (R1-F6)
 *
 * INFORMATION (printed, not counted)
 *   H1   the first save held 12 s, " ZQH1", " ZQH2", ⌘S: when ZQH2 is sent,
 *        what the pill and ⌘S say meanwhile, whether ZQH2 is kept (review
 *        round 1, R1-A2: one write at a time has no time limit)
 *   H2   device A's saves fail while " ZQTA" waits; device B (another
 *        browser, the same account) opens the poster and saves " ZQTB"; A's
 *        network comes back, A types nothing: which word is stored 35 s later
 *        (review round 2, R2-A2: every write is unconditional, so A's retry
 *        replaces B's work; on main A's word was lost instead)
 *   H3   the session ends (token expired, refresh refused) while a save is
 *        failing: is the word stored, is it in the closed page's "Download a
 *        copy", is leaving warned (review round 2, R2-A3; the same on main)
 *   H4   Layout › Poster name: "ZQH4 name" typed, then a click into a text
 *        block, ⌘S: what is said and stored, what the field shows, whether
 *        closing the tab warns (the first review round 3's probe N1: the
 *        name stays a draft outside its field)
 *   H5   a change stored; one line, "ZQW 12.4", pasted into the starting
 *        table's fifth cell; then ⌘Z: the table drawn and stored before,
 *        after and after ⌘Z (round 2 of the restarted review, N2-F1: the
 *        table's paste handler replaced the table; older than fix 27; fixed
 *        by record 32, whose claims are scripts/table-paste-check.mjs)
 *   H6   a 30 s session token; offline while " ZQTOK" waits; the pill every
 *        second for 45 s, ⌘S at 11 s; back online: when the word is stored
 *        (N2-F2: the write waits inside the client's token refresh, so the
 *        hook sees no failure; S5, a fresh token, is the contrast)
 *   H7   Layout › the poster's width typed, ⌘S: what is said and stored
 *        (N2-F4: a field that keeps a draft)
 *   H8   Layout › Poster name emptied, Enter: the stored title before and
 *        after, what the field and its button show (older than fix 27; round
 *        3 of the restarted review measured it in Chromium)
 *   LD-diagnostics-at-leave  saves failing, a word typed, 1.5 s later the
 *        page goes to another address: does the diagnostics batch the
 *        failure queued reach the API (record 38's sibling, not fixed)
 *   L2-sizes  the PATCH body of a save of each print-path poster
 *        (lib/printPathPosters.mjs), images as storage:// paths and as
 *        data: URLs, against 64 KiB (record 38)
 *   L3-inapp-kept-then-duplicate  saves refused, a word, Back inside the
 *        app, the dashboard's Duplicate: does the copy hold the kept change
 *        (record 38's review round 2)
 *   L2-engine-keepalive-limit  keepalive PATCHes of N bytes from the
 *        editor's page, one at a time, then two of 40,000 at once: which the
 *        engine refuses (round 2)
 *   LH-hidden-real  a second page brought to the front: does the editor's
 *        page report hidden under this engine (round 2)
 *   LW-net-close-60, LW-waiting-save-net  a failure with no answer 60 ms
 *        before the tab close, and a save waiting on one: the 200 ms rule's
 *        cost (round 3)
 *   L4-slow-past-settle-bd  the first save held 12.5 s, past the settle:
 *        is the older applied over the newer (the record's stated bound,
 *        round 3, R3-4)
 *   L3-inapp-two-kept-close  two kept changes, the tab closed: the dialog
 *        and each poster's keepalive write (one shared quota; round 3, R3-7)
 *   TE-I-type-after-sub  " ZQCO<sub>2</sub>" pasted, End, " ZQNEXT": whether
 *        the typed word goes into the subscript (record 39 §10)
 *   TE-I-engine-commands  the engines' own superscript / subscript commands
 *        run from the page on a selected "2", as is and with the page's base
 *        rule for sub and sup overridden: the states they read and whether a
 *        second press removes (record 39's cause)
 *   TE-I-zoom  the page's zoom before and after the browser's own zoom key
 *        outside text and Control + Shift + = in text (whether Playwright's
 *        keys reach the browser's zoom at all)
 *   TE-I-insert-variants  in a scratch contenteditable holding
 *        <div>ZQV1</div><div>ZQV2<br>/al</div>: execCommand insertText over
 *        the "/al" text (what the editor did), and three other ways to put
 *        α there: which keep the <br> (the cause of TE4jb in Firefox)
 *   TE-I-layouts  keydowns dispatched as German and French layouts send
 *        them, with Ctrl, on a selected "2": which the editor takes, and as
 *        what (record 39's review round 1, R1-F4; untrusted events)
 *
 * CONTROLS (exit 2 if one fails)
 *   C1   the backend works: " ZQOK" is stored within 3 s and the pill says
 *        "Saved…"
 *   LK   the fake backend sees a keepalive fetch the page sends at
 *        beforeunload as the tab closes, and at pagehide as it goes to
 *        another address (record 38); printed: whether one sent at pagehide
 *        as the tab closes is seen (it is not, in any engine: below)
 *
 * BLIND SPOTS
 *   - The backend is a fake (lib/guestBackend.mjs); the real PostgREST and
 *     the real network are not driven. "network" aborts the request
 *     (Playwright's `internetdisconnected`); "refused" answers 403.
 *   - The PDF is read as the print window's DOM, not a printed file; the
 *     PowerPoint file's slide XML is read, not opened in PowerPoint.
 *   - Line geometry is read from layout (Range rectangles); paint is not.
 *   - A leave warning is the browser's beforeunload dialog under
 *     Playwright; whether a real browser shows it after the page has had a
 *     user gesture is the browser's rule (each scenario types first).
 *   - A guest's own leave prompt (useLeaveGuard) is not exercised: these
 *     users are signed in.
 *   - In-app navigation that does not unload the page is not driven.
 *   - By default the app runs on Vite's dev server, under React's
 *     StrictMode, which runs each effect twice at mount (S9 is that server's
 *     case); POSTR_SERVE=preview runs every scenario on the production build
 *     (lib/editorHarness.mjs; `npm run build` first; no POSTR_MUTANT then).
 *   - A scenario that needs a control a feature switch hides is skipped
 *     while the tree has that switch off (record 29: E5 the Content box,
 *     ADJUSTMENTS_ENABLED; D1 and K11 the sidebar's Duplicate,
 *     EDITOR_EXTRAS_ENABLED); `sourceFlag` reads the file on disk. Printed
 *     as "skipped (switch off)" and counted on the summary line of that
 *     name (lib/editorHarness.mjs switchesOff, since the merge with record
 *     30).
 *   - Shift+Enter is pressed at a line's end only, and an input method's
 *     Enter is not driven (fix 12's undo-history-check drives composition).
 *   - H5's paste is a paste event carrying plain text (the system clipboard
 *     is not touched); the browser's own ⌘V is not driven. So is L1-paste-*.
 *   - Record 38: a request the page sends at pagehide as the tab closes is
 *     not seen by Playwright's routes in any engine (control LK prints it:
 *     the page's target has gone), so a tab close is measured through what
 *     the page sends at beforeunload. A request the browser cancels before
 *     it reaches the network is not seen at all (the leave scenarios keep
 *     the page's own record of each poster write it makes, with or without
 *     keepalive, in localStorage, and print it as writesMade); one the fake
 *     has received
 *     is applied after its hold even if the page has gone (a server that
 *     received it). Playwright's routes answer the CORS preflight of a
 *     cross-origin PATCH; whether an engine sends a keepalive request that
 *     needs a preflight over the real network, and Supabase's answer to
 *     it, are not driven. A tab hidden (visibilitychange) is not driven: a
 *     headless page stays visible.
 *     is not touched); the browser's own ⌘V is not driven.
 *   - Record 39's keys are Playwright's, delivered to the page: whether a
 *     real browser's own zoom (Ctrl + = in Windows browsers) acts before the
 *     page can cancel it is not seen (TE-I-zoom: Playwright's ⌘ + = zooms
 *     nothing); Windows is told to the page (TE2w), not run. The format bar
 *     is pressed with the mouse only. WebKit's ⌘C / ⌘V use the macOS
 *     pasteboard, shared with other runs on the machine (TE3c, TE3sc, the
 *     pastes): run WebKit alone, and again when a reading looks wrong.
 *
 * RUN (from apps/web; apps/web/.env points at the fake backend)
 *   node scripts/keep-work-check.mjs [--only id,id] [--json file]
 *   env POSTR_BROWSER (chromium|firefox|webkit), PORT (default 5820),
 *   OUT_DIR, POSTR_REPO, POSTR_MUTANT, POSTR_SERVE=preview
 *   (lib/editorHarness.mjs)
 *
 * EXIT 0 no claim observed and the control passed · 1 a claim observed ·
 *      2 the control failed, a scenario errored, or the harness did not start
 *
 * Side effect: rewrites apps/web/public/version.json (Vite's build stamp);
 * restore with `git checkout -- apps/web/public/version.json`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { SWITCH_OFF, log, startHarness, switchOffReason, switchesOff } from './lib/editorHarness.mjs';
import { openSignedIn, versionPosts } from './lib/keepWorkKit.mjs';
import { ENTER } from './lib/keepWorkEnter.mjs';
import { SAVE } from './lib/keepWorkSave.mjs';
import { ELSEWHERE } from './lib/keepWorkElsewhere.mjs';
import { LIMITS } from './lib/keepWorkLimits.mjs';
import { LEAVE } from './lib/keepWorkLeave.mjs';
import { LEAVE_ROUND1 } from './lib/keepWorkLeaveRound1.mjs';
import { LEAVE_ROUND2 } from './lib/keepWorkLeaveRound2.mjs';
import { LEAVE_ROUND2_PATHS, closeBfBrowser } from './lib/keepWorkLeaveRound2Paths.mjs';
import { LEAVE_ROUND3 } from './lib/keepWorkLeaveRound3.mjs';
import { TEXT_EDIT } from './lib/keepWorkTextEdit.mjs';

const PORT = Number(process.env.PORT ?? 5820);
const argVal = (name) => {
  const a = process.argv.find((x) => x === name || x.startsWith(`${name}=`));
  if (!a) return null;
  return a.includes('=') ? a.split('=')[1] : process.argv[process.argv.indexOf(a) + 1];
};
const ONLY = argVal('--only')?.split(',') ?? null;
const JSON_OUT = argVal('--json');
const SCENARIOS = [...SAVE.filter((s) => s.control), ...LEAVE.filter((s) => s.control), ...ENTER, ...SAVE.filter((s) => !s.control), ...ELSEWHERE, ...LIMITS, ...LEAVE.filter((s) => !s.control), ...LEAVE_ROUND1, ...LEAVE_ROUND2, ...LEAVE_ROUND2_PATHS, ...LEAVE_ROUND3, ...TEXT_EDIT];
/** Scenarios allowed to make a version (K7): they press ⌘S, Save version or Restore (K9, K10 and K11 press none). */
const MAKES_VERSIONS = /^(K[1-8]-|H1-|H4-|H6-|H7-)/;

let h;
try {
  h = await startHarness({ name: 'keep-work', port: PORT });
} catch (e) {
  log(`[harness] instrument error: ${String(e?.stack ?? e).slice(0, 600)}`);
  process.exit(2);
}
const results = [];
let silentVersions = 0;
try {
  for (const sc of SCENARIOS) {
    if (ONLY && !ONLY.some((o) => sc.id === o || sc.id.startsWith(o))) continue;
    // A scenario that drives a control a feature switch hides (`needs`,
    // record 29) is skipped while the tree under test has the switch off.
    const off = switchesOff(sc.needs);
    if (off.length) {
      results.push({ id: sc.id, how: sc.how, skipped: switchOffReason(off), switchOff: true });
      continue;
    }
    const t0 = Date.now();
    let s;
    try {
      s = await openSignedIn(h, sc.session);
      const r = await sc.run(h, s);
      if (!MAKES_VERSIONS.test(sc.id)) silentVersions += versionPosts(s.state).length;
      results.push({ id: sc.id, how: sc.how, ms: Date.now() - t0, pageErrors: s.state.errors, ...r, ...(sc.info ? { info: true } : {}), ...(sc.control ? { control: true } : {}) });
    } catch (e) {
      results.push({ id: sc.id, how: sc.how, error: String(e?.message ?? e).slice(0, 300) });
    } finally {
      await s?.context.close().catch(() => {});
    }
  }
} finally {
  await closeBfBrowser();
  await h.stop();
}
results.push({ id: 'K7-no-silent-versions', how: 'versions made by scenarios that never pressed ⌘S, Save version or Restore', claims: { K7: silentVersions > 0 }, numbers: { silentVersions } });

log(`\n== keep-work-check · ${h.engine} · ${h.serve} · ${h.git}${h.mutant ? ` · MUTANT ${h.mutant}` : ''} · host ${process.platform}`);
let exit = 0;
for (const r of results) {
  if (r.error) { exit = 2; log(`[ERROR]    ${r.id}: ${r.error}`); continue; }
  if (r.skipped) { log(`[skipped]  ${r.id}: ${r.skipped}`); continue; }
  const nums = Object.entries(r.numbers ?? {}).map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' · ');
  if (r.control) {
    if (!r.ok) exit = 2;
    log(`[${r.ok ? 'control ok' : 'CONTROL FAILED'}] ${r.id}: ${nums}`);
  } else if (r.info) {
    log(`[info]     ${r.id}: ${nums}`);
  } else {
    const obs = Object.entries(r.claims).filter(([, v]) => v).map(([k]) => k);
    const clean = Object.entries(r.claims).filter(([, v]) => !v).map(([k]) => k);
    if (obs.length && exit === 0) exit = 1;
    log(`[${obs.length ? 'OBSERVED' : 'clean'}]  ${r.id}: observed {${obs.join(', ')}} clean {${clean.join(', ')}}\n           ${nums}`);
  }
  if (r.pageErrors?.length) log(`           page errors: ${r.pageErrors.join(' | ').slice(0, 300)}`);
}
const switchSkips = results.filter((r) => r.switchOff).map((r) => r.id);
log(`${SWITCH_OFF}: ${switchSkips.length}${switchSkips.length ? ` (${switchSkips.join(', ')})` : ''}`);
if (JSON_OUT) fs.writeFileSync(path.resolve(JSON_OUT), JSON.stringify({ engine: h.engine, serve: h.serve, git: h.git, mutant: h.mutant, host: process.platform, results }, null, 2));
log(`exit ${exit} (0 clean · 1 a claim observed · 2 instrument)`);
process.exit(exit);
