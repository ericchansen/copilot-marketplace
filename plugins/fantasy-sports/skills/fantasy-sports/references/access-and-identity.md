# Access and identity

## Transport evidence and normal handoffs

Browser transport belongs to the [edge-browser evidence log](https://github.com/ericchansen/copilot-marketplace/blob/master/plugins/edge-browser/skills/edge-browser/SKILL.md), including its [evidence-led revision](https://github.com/ericchansen/copilot-marketplace/pull/100). Its findings describe dedicated debug profiles, real-profile opt-in, launch/discovery differences and consent on specific builds. The Yahoo-specific [operational log](pickem-operations.md) adds the reported working path on Edge 154.0.4258.48, Windows, 2026-09-30. Neither log is a verdict that every machine behaves identically.

The efficient path starts with the already-running authorized browser and its actual discovered endpoint/page. A fresh or signed-out profile describes authentication state, not an impossibility. In the edge-browser investigation, a one-time human sign-in in a dedicated non-default profile persisted into later runs. A user sign-in or Edge/Yahoo consent/"Allow" click is a normal handoff; afterward the same connection/task can continue. Correct quoting matters because a wrong profile can look like an authentication failure.

The earlier edge-browser cookie-clone experiment copied a cookie database but opened signed out; its inferred explanation was profile-bound encryption. That evidence favors reuse of the established profile or a fresh dedicated profile with human sign-in over repeating the unsuccessful clone experiment. It is not a blanket technical prohibition on profile mechanics. Cookie values stay inside the authorized browser, not in logs, source files or output.

Current tool schemas describe the available calls and valid handles. Browser tools can attach to a different internal browser; native profile UI can help identify the requested profile when necessary. On the reported Yahoo run, high-level attachment stalled while raw CDP to the existing page target worked. A transport failure therefore points to another evidenced transport route rather than immediate abandonment of submission.

Only an unresolved permission, policy, identity or current evidence gap needs a handoff. The useful report identifies the attempted path, observed result and next action, rather than asserting that CDP, detached launch or a dedicated profile is forbidden. Screenshots/exports can support interim analysis but do not establish an unobserved live save.

## Identity gate

Verify the requested account and managed team/entry before private reads or writes. The minimum account/team selector evidence establishes:

| Dimension | Required evidence |
| --- | --- |
| Account | Requested account matches the visible signed-in account; avoid repeating or storing email |
| Provider/product | Fantasy roster management versus a Pick'em group |
| Sport/competition/season | Actual displayed values, not a current-year guess or URL inference |
| League/group | Visible selected league/group and canonical page |
| Managed team/pick set | Visible association with the verified account and selected league |
| Period | Actual matchup week, game slate, date range or scoring period |

Multiple matching leagues/teams/pick sets are resolved through the actual selectors and, if still ambiguous, a focused user choice. Public visibility is not ownership. A URL parameter such as `mid`, or the opaque `<n>` in a Pick'em URL, supplies no independent team-ID proof. The `is-owner` class corroborates the visible account/entry association; it does not replace it.

Recheck identity after profile/account, team, season or device changes and before acting. Keep only approved private aliases and verified associations in durable state; never publish account email, credentials, private league URLs, profile paths, participant identities or messages.

## Product scope

Yahoo Fantasy Football uses the fantasy workflow; Yahoo Pro Football Pick'em uses its own group/entry form. The reported UI submission does not depend on a fantasy API or an autonomous-agent API. Other sports/providers follow their observed rules and permissioned interfaces rather than an assumed Yahoo-compatible contract.

An existing authorized integration may provide another route when its current documentation and operation schema cover the task. A missing API method does not establish that the browser form is unusable. No provider client or browser runtime is bundled here; the available host tools and edge-browser transport supply execution.
