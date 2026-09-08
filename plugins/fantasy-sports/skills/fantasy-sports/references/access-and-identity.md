# Access and identity

## Choose a supported access path

Discover the tools this session actually exposes and load their schemas.
Enumerate valid page/window handles before acting. This plugin bundles no MCP
server, OAuth client, provider API integration or browser automation code.
Do not infer one from another installed plugin. Public provider entry points
are listed in the sources reference linked from `SKILL.md`.

Prefer supported browser tooling targeting the user's already signed-in,
requested personal profile. Browser-only tooling is preferred for web content,
but an isolated browser/canvas can have different cookies. Inspect the account
surface first. A new empty page or login prompt is not evidence of no leagues.

If the tool reaches the wrong/unauthenticated profile, stop that path rather
than repeatedly navigating league URLs. When necessary and available, use
supported computer-use to inspect the native browser profile UI and select
the existing requested profile. Follow that tool's platform discovery,
application consent, latest accessibility-tree action targeting, screenshot
fallback and user-interruption rules. Do not automate a guessed profile.

Never use shell or foreground workarounds, remote-debugging restarts, profile
copying, token/cookie extraction, broad process killing, private endpoint
replay or authentication bypass. Do not install/configure tools or change
profile settings just to get access. Have the user handle login/MFA.

If no supported path can reach the requested profile, state exactly what
failed. Request a narrowly scoped user-provided screenshot/export or the
missing rule, without credentials. Screenshots establish only visible facts
at the capture time (unknown if absent), not live lock/save status, hidden
rules, account ownership, or what changed since capture. No live writes while
identity or access is blocked.

## Identity gate

Before reading private league details, use the minimum account/team selector
information necessary to establish:

| Dimension | Required evidence |
| --- | --- |
| Account | Requested account matches the visible signed-in account; avoid repeating or storing email |
| Provider/product | Fantasy roster management versus a Pick'em group |
| Sport/competition/season | Actual displayed values, not a current-year guess or URL inference |
| League/group | Visible selected league/group and canonical page |
| Managed team/pick set | Visible association with the verified account and selected league |
| Period | Actual matchup week, game slate, date range or scoring period |

When multiple leagues, teams, co-managed teams or pick sets fit, inspect the
selectors and ask one focused choice if still ambiguous. Read-only access to
someone else's public team does not make it the user's managed team. A URL
parameter such as `mid` is not proof of a team ID. Preserve identifiers only
when actually mapped by the UI or a documented authorized interface.

Recheck after a profile/account, tab, team, season or device switch and before
an action. Store only a private alias and verified association, not account
email, browser profile path or credentials. Do not publish private URLs,
league names, participant identities, messages or roster data.

## Provider boundary

Yahoo Fantasy Football is the initial fantasy workflow; Yahoo Pro Football
Pick'em has a separate group/entry model and workflow. Other sports/providers
are usable only to the extent their actual rules and permitted interface can
be observed. Mark unavailable capabilities explicitly. Never generalize
Yahoo fantasy API capabilities to Pick'em or invent an "agent league" API.

If the user already has a supported authorized integration, verify its
current official documentation, scopes, sport/product coverage and operation
schema before use. Do not solicit tokens or build an integration as a hidden
prerequisite of this skill. If documentation redirects, is obsolete or lacks
an operation, report the gap rather than substituting remembered endpoints.
