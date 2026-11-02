# RLS verification — isolated development database only

This is a test specification, not an executed test. Do not run against production.

## Setup
1. Provision a disposable Supabase development project with Auth and Postgres.
2. Use the Supabase CLI to generate a migration filename and move the reviewed SQL into it.
3. Apply migration in development only.
4. Create three **test** Auth users: owner A, owner B, and nonmember C.
5. Via a trusted administrator insert profiles for A/B/C and memberships for A/B with role `owner`.

## Tests
For each query, authenticate as the relevant user using the publishable key (not service_role).
- Anon: SELECT profiles and agency_memberships => no rows.
- Nonmember C: own membership => no rows; own profile => no rows.
- Owner A: membership/profile A visible; B and C invisible.
- Owner B: membership/profile B visible; A and C invisible.
- A/B/C: INSERT/UPDATE/DELETE on memberships and profiles => denied.
- A/B: role must be `owner`, identical allowed operations.
- Invalid login => no dashboard access.
- Sign out then navigate to /dashboard => redirect to /login.
- Expired token => refresh or deny; never leak privileged data.
- Check that public signup is disabled and Auth redirects are restricted.

## Record evidence
For each test capture: environment project ID, migration version, test identity (synthetic UUID only), expected outcome, actual outcome, timestamp and pass/fail. Do not record passwords, access tokens or real founders' personal data.
