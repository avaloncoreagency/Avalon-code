# Avalon OS Security Policy

## Private vulnerability reporting

Report issues privately using **GitHub Security → Advisories → Report a vulnerability**, when available. Otherwise contact an Avalon Core Agency owner through an established private business channel. Do not post credentials, exploit details, customer information or screenshots containing secrets in public issues or PRs.

## Supported scope

The supported release branch is `main`. Reports about owner authentication, RLS policies, privileged functions, API token authorization, project libraries, CI workflows, infrastructure and client-data privacy are in scope.

## Review process

Owners triage reports privately, reproduce with synthetic data in isolated environments, write targeted least-privilege fixes, run negative authorization and regression tests, then merge by a reviewed PR. Preview must never connect to production data. Reporting does not imply an SLA.

## Disclosure

Coordinate disclosure with the owners after remediation. Do not publicly disclose unpatched exploitation paths or customer data.
