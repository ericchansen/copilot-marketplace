# Yahoo Pick'em operational evidence

**Environment: Yahoo Pro Football Pick'em, Microsoft Edge 154.0.4258.48, Windows, 2026-09-30.**

Source: the operator-reported completed weekly submission supplied for this revision. The documentation author did not repeat the live transaction. Findings below are observations scoped to that run; mechanisms are inferences unless explicitly identified as observed. A different Edge build, OS, transport, profile state or page layout is a reason for a bounded re-test. No account, group, entry, player identity, cookie value or private URL is reproduced here.

Transport context comes from the [edge-browser evidence log](https://github.com/ericchansen/copilot-marketplace/blob/master/plugins/edge-browser/skills/edge-browser/SKILL.md) and its [evidence-led revision](https://github.com/ericchansen/copilot-marketplace/pull/100). This file records the Yahoo-specific continuation, not replacement browser policy. Public protocol references describe [HTTP target discovery/closure](https://chromedevtools.github.io/devtools-protocol/#endpoints), [Runtime.evaluate](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-evaluate), [Page.reload](https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-reload) and [Browser.close](https://chromedevtools.github.io/devtools-protocol/tot/Browser/#method-close); they support the command shapes, not the reported Yahoo outcomes.

## Permission rules

- Verify the requested account and owned entry before private reads or writes. Obtain scoped authorization for the proposed picks, confidence values and tiebreakers, or verify applicable unexpired standing authority.
- Never type the user's credentials. Hand sign-in, MFA and required consent/"Allow" clicks to the user, then resume.
- Never log, print, return or exfiltrate cookie/token values. Keep private URLs, identifiers and runtime state out of the plugin and PR.
- Keep browser access within the user-authorized profile/instance and loopback endpoint. Do not bypass policy or consent, change commissioner settings or another manager's entry, or make real-money transactions without explicit authority.
- Re-read identity, rules, selected week, locks and current values immediately before an authorized edit. Verify the persisted result after Save and reload. Reconcile ambiguous attempts before retrying.
- Obtain authorization before closing targets or an entire browser instance. Close only task-owned duplicates covered by that scope; `Browser.close` affects the whole attached instance.

## Findings ledger

Every finding inherits the environment/date stamp above. Cookie names, DOM identifiers and illustrative labels below are technical identifiers, not reusable account state.

### 1. Raw CDP reached the existing Pick'em page when high-level attachment stalled

**Action:** the run reused a kept CDP-enabled Edge instance, fetched `http://127.0.0.1:<port>/json`, selected its `type: "page"` target with the authorized `/pickem/` URL, and connected directly to that target's `webSocketDebuggerUrl` using the Node `ws` module and header `Origin: http://127.0.0.1:<port>`.

**Observed:** a higher-level attach attempt, reported as `connectOverCDP`, hung with wedged/duplicate page targets; raw CDP to the page worked. This report label is not a claim about a Puppeteer method signature. Duplicate page targets accumulated during navigation churn. `GET /json/close/<id>` closed an identified extra target and returned plain text, not JSON. Each bounded script had a hard process timeout.

**Inferred mechanism:** attachment through an existing page avoided the high-level target-initialization path. Navigation churn appeared associated with duplicate targets; the browser's internal cause was not established.

**Consequence:** the evidenced fallback is a direct page WebSocket rather than repeated high-level reconnects. The target ID and WebSocket come from the current endpoint, with exact authorized origin/path/week matching when several `/pickem/` targets exist. The HTTP closure response is consumed as text. Task-owned duplicate cleanup needs the permission scope above, not indiscriminate closure of every page.

The observed `ws` connection shape was `new WebSocket(page.webSocketDebuggerUrl, { headers: { Origin: origin } })`, where `origin` is the actual loopback origin. Availability of `ws` belongs to the chosen host runtime; this plugin adds no package dependency or global installation. Raw CDP requests carry distinct IDs, and replies correlate by ID rather than arrival order. For a direct page target, `Runtime.evaluate` runs in that page; a browser-target attachment has a different session-routing shape described by edge-browser.

A bounded script can express the reported guard as `const guard = setTimeout(() => { console.error("CDP deadline exceeded"); process.exit(2); }, timeoutMs);`, with a scope-appropriate timeout. Socket-open, HTTP and command errors remain visible; `Runtime.evaluate` failures include `exceptionDetails`. Successful completion clears the guard and closes the client socket, not the kept browser. Exit code 2 after an attempted Save means uncertain persistence, not authorization to resubmit. A sign-in/consent handoff resumes from a fresh state read rather than racing the timeout.

### 2. A detached launch survived its initiating shell

**Action:** Edge was first launched from a PowerShell shell, and later through a detached asynchronous launcher.

**Observed:** the shell-owned Edge process disappeared about 10-14 seconds after its launching shell exited. The detached instance kept its CDP listener alive across subsequent automated runs.

**Inferred mechanism:** Windows Job Object ownership was the reported explanation for child-process reaping; the mechanism was not independently instrumented in this documentation revision.

**Consequence:** the working launch lifetime was detached from the bounded command shell. A host may call that mode `async` plus `detach: true`; the actual launcher schema determines the spelling and consent. Readiness includes the listener remaining responsive after the launch command ends, not merely a process starting once. The browser lifetime and an individual script's timeout are separate.

### 3. Quotes inside profile flags preserved a spaced profile name

**Action:** PowerShell/`Start-Process` received a spaced profile name first without quotes inside the flag value, then as `--profile-directory="Default Profile"`; the same quoting pattern applied to `--user-data-dir="<approved non-default data directory>"`.

**Observed:** without embedded quoting, Edge received `--profile-directory=Default`, selected the wrong profile and displayed an `edge://force-signin` prompt. Quoting inside the argument preserved the intended profile selection.

**Inferred mechanism:** argument joining/splitting removed the intended boundary around a value containing spaces.

**Consequence:** the PowerShell array element shape `'--profile-directory="Default Profile"'` preserves the internal quotes; for a variable directory, the equivalent shape is ``"--user-data-dir=`"$dir`""``. These are flag-quoting examples, not prescribed personal profile names or directories. The actual authorized profile and data directory come from the transport setup. A sign-in prompt after a launch may therefore be a quoting/profile-selection symptom rather than lost authorization.

### 4. Yahoo's normal sign-in redirect recovered an existing session without credential entry

**Action:** after a force-killed session, the run navigated through Yahoo's sign-in URL with `.done` set to the URL-encoded authorized picks URL and `activity=ybar-signin`.

**Observed:** the operator reported that Yahoo login cookies named `T` and `Y` had disappeared while cookies named `A1` and `A3` survived. The normal `https://login.yahoo.com/` navigation returned directly to the picks page signed in, without credential entry; `T`/`Y` were reported restored. No cookie values are needed to apply this finding.

**Inferred mechanism:** interruption of a pending cookie flush may explain the partial loss, and surviving browser-held session/consent state may explain silent re-authentication. Those cookie roles are the run's explanation, not a verified universal Yahoo cookie contract.

**Consequence:** graceful `Browser.close` on an authorized task-owned instance is the evidenced alternative to force-kill when closing is actually needed; otherwise the working instance can stay alive. Yahoo's live sign-in link supplies any additional current query parameters; `.done` returns to the verified picks URL, not a literal group ID from a previous run. If the redirect instead requests credentials, the one-time human sign-in handoff continues the same workflow. Recovery is judged by visible account/entry identity, not by reading or exporting cookie values.

### 5. The current choice handler lived on the radio input, not its cell

**Action:** on the layout observed the week of 2026-09-30, the run tried clicking a choice cell, then the nested radio input.

**Observed:** the editable form URL had shape `/pickem/group/<groupId>/<n>/picks?week=<W>`. The table was `table#ysf-picks-table`; each game was `tr.matchup` with `a[id="info-gid-<GID>"]`. The choice cells were `td.favorite-win.choice` and `td.underdog-win.choice`, containing `input[type="radio"]` IDs `pf<GID>` and `pu<GID>`. A cell click or `cell.click()` did not register; the input's `.click()` set its checked state. The prior standalone-radio layout no longer described this page.

**Inferred mechanism:** the cell path did not reach the effective choice handler while the input path did. This does not establish a trusted-event requirement; DOM `.click()` is itself synthetic.

**Consequence:** the useful mutation target is the exact radio inside the verified matchup row. For example, `row.querySelector('input[type="radio"][id="pf<GID>"]').click()` uses the live GID and a selected favorite; `pu` selects the underdog. The selected side comes from the approved team-to-row mapping, not a blanket favorite choice. A layout change calls for current DOM discovery rather than reuse of a guessed ID.

### 6. The canonical owned entry exposed the editable form

**Action:** the run compared an uneditable page with the canonical selected-week picks URL after sign-in and consent were settled.

**Observed:** `table#ysf-picks-table` carried `is-editable` versus `not-editable`, with `is-owner` on the owned entry. In the `not-editable` state, no effective choice handlers were observed and clicks did not register. The canonical owned page rendered `nflp has_spread is-editable is-owner`. Its saved-progress text was `Picks Saved N of 16` for that observed slate.

**Inferred mechanism:** page context and authentication/consent state influenced whether the editable form was initialized. `not-editable` alone did not identify which cause applied.

**Consequence:** the normal entry link supplies `<groupId>`, opaque `<n>` and selected `<W>`. Loading that current canonical URL recovered editability in the report. Genuine lock deadlines, a different owner, permissions and scoring context remain separate explanations; changing CSS classes or removing `disabled` would not grant authorization or prove a legal edit. The observed denominator 16 is not a weekly constant.

### 7. Radio changes and persisted picks were separated by an explicit Save

**Action:** the run set all 16 observed game radios, then clicked the page's Save control.

**Observed:** radio selection alone left `Picks Saved 0 of 16`. An anchor `a.ysf-cta-save` with text `Save Picks` was associated with `form#confPointForm`, `name="ysf-picks-form"`, `method="post"`. The observed form action had shape `.../pickem/<id>/<n>/picks`. Clicking Save changed the counter to `16 of 16` and disabled the button.

**Inferred mechanism:** the selection state was local until the explicit save action persisted the form.

**Consequence:** DOM checked state is an edit preview, not a submitted result. The live form/button supplies the current action and handler; the observation is not a reason to hardcode or replay a POST URL. After approved field edits, the observed path was the actual `a.ysf-cta-save` control's click, followed by reload/read-back.

### 8. Tiebreaker names disambiguated a duplicate DOM ID

**Action:** the run addressed score fields by `name`, selected team options by their live option values, then dispatched `input` and `change` before Save.

**Observed:** score names were `tb_g1as` / `tb_g1hs` (away/home for the game labeled Monday in that run) and `tb_g2as` / `tb_g2hs` (away/home for the game labeled Sunday). `tb_g2hs` shared the duplicate DOM ID `tiebreakSundayAway`, so lookup by ID could address the wrong field. Selects `tb_tmp` and `tb_tlp` represented the most/fewest total-points team and used provider team-code option values; the run showed Baltimore `33` and Tennessee `10`.

**Inferred mechanism:** duplicate IDs made ID-based lookup ambiguous, while the distinct field names resolved the intended controls. Change events reached the form's state handling after value assignment.

**Consequence:** observed selectors were `input[name="tb_g1as"]`, `input[name="tb_g1hs"]`, `input[name="tb_g2as"]`, `input[name="tb_g2hs"]`, `select[name="tb_tmp"]` and `select[name="tb_tlp"]`. A field edit used `el.value = String(value); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));`. Current labels identify the actual game/home/away mapping, deadlines and most/fewest semantics; current option text supplies the team-to-code mapping. Monday/Sunday and the observed codes are examples, not a permanent schedule or codebook.

### 9. Hard reload distinguished the saved result from an optimistic UI

**Action:** after Save, the run hard-reloaded and read the page's server-rendered state again.

**Observed:** the confirmation included `Picks Saved N of N`, each matchup's checked `pf`/`pu` radio mapped back to its team, and every tiebreaker field value.

**Inferred mechanism:** fresh state after the save round trip distinguished persistence from the pre-save DOM.

**Consequence:** a complete counter corroborates but does not replace per-value comparison. A raw CDP reload can use `Page.reload` with `{"ignoreCache":true}`; the subsequent read waits for the intended URL and table/form to be ready after the new navigation rather than a fixed sleep or the old DOM. New document handles replace stale ones. Missing/wrong/stale values produce an explicit discrepancy and reconciliation, not an inferred success or blind repeat Save.

## Bounded replay map

This is the operational sequence evidenced above. The account/entry, week, target ID, GIDs, selected sides, scores, team options and limits are runtime values from current page evidence and the approved proposal, not defaults stored in this plugin.

| Phase | Working path in this environment | Observable result |
| --- | --- | --- |
| Transport | Existing authorized Edge instance; edge-browser handles setup/consent if needed; raw page CDP is the reported fallback when high-level attach stalls | Current matching target, open socket, bounded command response |
| Identity/context | Minimal signed-in account and owned-entry check, current canonical selected-week URL, rules/locks and table classes | Correct owner, sport/scoring mode, week, actual editable controls; any sign-in/consent handoff resolved |
| Proposal/authority | Approved team picks, confidence values when enabled and all tiebreakers, or existing scoped standing authority | Current plan still within authorization and deadlines |
| Game inputs | Live `info-gid-<GID>` row mapping to approved team and nested `pf`/`pu` radio `.click()` | Checked radio matches that team's row; saved counter may still show the old total |
| Tiebreakers | Unique names for score inputs, live option mapping for `tb_tmp`/`tb_tlp`, value plus `input`/`change` | Every intended preview value and unaffected field match the proposal |
| Save | Live `a.ysf-cta-save` in the current form, with live handler/action context | Observed saved counter/button response, still provisional until reload |
| Verification | Fresh navigation from hard reload, current URL/table readiness, checked radios -> teams, all score/select/confidence values and saved indicator | Exact authorized values persisted; discrepancies recorded individually |
| Ledger | Source URL/time, proposal, authority, attempt and verified values recorded in approved private state | Recommendation, submission and official outcome remain separate |

Raw protocol call shapes for this map are `{"id":1,"method":"Runtime.evaluate","params":{"expression":"<current-page expression>","returnByValue":true,"awaitPromise":true}}` and `{"id":2,"method":"Page.reload","params":{"ignoreCache":true}}`. Inspection can use `document.querySelector('table#ysf-picks-table')`, its current `tr.matchup` rows, `input[type="radio"]:checked`, and the named fields above. A missing/duplicate match is an observed layout/context discrepancy to investigate; it is not a reason to silently select the first unrelated control.

## Limits of the observation

This report covers the spread-card submission form, not every confidence-scoring variant, browser build, network condition, cookie lifetime or later Yahoo redesign. It does not establish a stable API, unconditional silent sign-in, weekly game count, permanent team-code mapping or guaranteed unattended monitoring. Current confidence controls, if enabled, remain part of the proposal and post-reload comparison even though their selectors were not recorded in this run. The skill carries these findings across PCs; browser authentication and private runtime state have their own authorized setup and lifecycle.
