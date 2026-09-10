# Match the document to the reader

Choose a purpose before editing sentences. Classify mixed pages at passage level;
an informational note in a procedure is not another instruction.
The distinctions below use [Diataxis](https://diataxis.fr/) and the software-user
information perspective in [ISO/IEC/IEEE 26514:2022](https://www.iso.org/standard/77451.html).
The suggested structures are original templates, not requirements from those sources.

| Purpose | Reader need | Preserve |
|---|---|---|
| Tutorial | Learn through a supported experience | Setup, actions, expected observations, and enough guidance to recover |
| How-to or runbook | Complete real work | Preconditions, branches, ordered steps, results, stop conditions, and recovery limits |
| Reference | Look up exact behavior | Names, types, defaults, constraints, errors, versions, and complete qualifications |
| Explanation | Understand a design or behavior | Context, causal relationships, alternatives, reasons, and trade-offs |

Tutorials are not merely easier how-to guides. Explanations should not be reduced
to commands, and reference should not be padded with an unrelated walkthrough.
See [tutorials versus how-to](https://diataxis.fr/tutorials-how-to/),
[reference](https://diataxis.fr/reference/), and
[explanation](https://diataxis.fr/explanation/).

## README

Establish what the project does, who it is for, and the shortest supported path to
a useful result. Link to deeper guidance rather than putting every concept into
the first page.

Suggested structure: purpose, verified prerequisites, minimal working usage,
expected result, and links to reference or troubleshooting. Include installation
commands only when supported by the repository or authoritative product source.
Do not infer package-manager commands or platform support from a project name.

## Procedure or runbook

State applicability before the dependent action. Include required permissions and
environment context only when known. Keep commands, placeholders, and observations
visually distinct. Put the terminal result or acceptance condition beside the
operation it verifies.

Suggested structure: goal and scope, prerequisites, ordered steps with conditions,
success criteria, and supported failure/recovery paths.
Follow the project's safety and authorization requirements; a runbook is not
permission to execute it. See
[Google's procedure structure](https://developers.google.com/style/procedures).

## API or configuration reference

Prefer consistent entries for inputs, accepted values, defaults, output, errors,
side effects, and version-specific behavior. Do not fill an unknown field with a
plausible value. A code example must agree with the named API and version.

Preserve the difference between required, recommended, optional, deprecated, and
unsupported. Keep identifiers and normative keywords intact. Use tables only
when they make repeated fields easier to compare.

## Troubleshooting

Separate the observed symptom from possible causes and confirmed diagnoses.
Put read-only diagnostic steps before corrective actions when supported. Give
the evidence that distinguishes branches, plus the point where escalation is
necessary.

Do not turn a correlation into a cause. Do not invent a destructive recovery step
or claim that a reset is safe without supporting information. If no supported
recovery is known, say what is known and identify the missing evidence.

## Architecture explanation

Describe the context and constraints, then the design, its reasons, trade-offs,
and alternatives. Preserve qualifications such as "during a partition" or
"for this workload"; they can be the substance of the explanation.

Link assertions to the architecture records or implementation that supports them.
Distinguish intended behavior from observed implementation. If they disagree,
report the discrepancy instead of choosing whichever makes a cleaner narrative.

## Release notes

Describe user-visible changes, affected versions, compatibility, and required
actions when supported. Do not infer breaking changes or migration requirements
from a commit title alone. Link to the relevant change or migration guidance.

## Mixed pages and notes

Retain a short explanation when it is necessary to perform a step correctly.
Move longer background to a linked explanation rather than deleting it. An
informational note can describe behavior, but a required action belongs in the
procedure and a limit belongs with the operation or reference entry.
See [ASD-STE100 Issue 9](https://www.asd-ste100.org/assets/files/ASD-STE100_ISSUE9.pdf),
Sections 5-6.
