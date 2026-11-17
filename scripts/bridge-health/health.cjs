'use strict';

/**
 * Local, read-only cross-bridge preflight. This intentionally checks only
 * environment *presence*. An installed connector, a token variable or a
 * successful build is NOT evidence that a provider/API works.
 *
 * No network I/O, database reads, credentials or customer records.
 */
const present = value => typeof value === 'string' && value.trim().length > 0;
const state = values => values.every(present) ? 'CONFIGURED_UNVERIFIED' : 'MISSING_CONFIGURATION';
const enabled = value => value === 'true';

function bridgeReadiness(env = process.env) {
  const github = env.BRIDGE_GITHUB_TOKEN || env.GH_TOKEN || env.GITHUB_TOKEN;
  const creativeEnabled = enabled(env.AVALON_CREATIVE_BRIDGE_ENABLED);
  const creativeConfigured = state([
    env.AVALON_CREATIVE_BRIDGE_KEYS_JSON,
    env.AVALON_CREATIVE_BRIDGE_OWNER_ID,
    env.AVALON_CREATIVE_BRIDGE_MACHINE_EMAIL,
    env.AVALON_CREATIVE_BRIDGE_MACHINE_PASSWORD,
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ]);
  const warnings = [];
  if (creativeEnabled && creativeConfigured !== 'CONFIGURED_UNVERIFIED')
    warnings.push('Creative Bridge enabled but required staging configuration is incomplete.');
  if (enabled(env.AVALON_CREATIVE_BRIDGE_PRODUCTION_APPROVED))
    warnings.push('Creative Bridge production approval flag is set; independently verify the security release gate.');
  if (enabled(env.AVALON_PRODUCT_CONTROL_EXTENDED_UPLOADS))
    warnings.push('Extended Project Bridge categories require the reviewed SQL migration; this check cannot verify it.');

  return {
    schema_version: 1,
    evidence: 'CONFIGURATION_PRESENCE_ONLY',
    live_provider_health: 'UNKNOWN',
    connections: {
      project_bridge: {
        import_storage: state([env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY]),
        vercel_publish: state([env.AVALON_VERCEL_DEPLOY_TOKEN]),
        extended_categories: enabled(env.AVALON_PRODUCT_CONTROL_EXTENDED_UPLOADS) ? 'FLAG_ENABLED_SQL_UNVERIFIED' : 'DISABLED',
      },
      dev_bridge: {
        github: state([github]),
        vercel: state([env.BRIDGE_VERCEL_TOKEN, env.BRIDGE_VERCEL_PROJECT, env.BRIDGE_VERCEL_TEAM]),
        supabase: state([env.BRIDGE_SUPABASE_TOKEN, env.BRIDGE_SUPABASE_REF]),
        handoff: present(github) ? 'REQUIRES_FRESH_AUTHENTICATED_SYNC' : 'UNAVAILABLE_NO_AUTH',
      },
      creative_bridge: {
        registration: creativeEnabled ? creativeConfigured : 'DISABLED',
        production_gate: enabled(env.AVALON_CREATIVE_BRIDGE_PRODUCTION_APPROVED) ? 'FLAG_ENABLED_APPROVAL_UNVERIFIED' : 'DISABLED',
      },
      higgsfield: {
        delivery: 'UNKNOWN_REQUIRES_ARTIFACT_AND_PERMISSION_EVIDENCE',
        note: 'No Higgsfield generation, export, credit balance or authenticated provider call was verified.',
      },
    },
    warnings,
    next_verification: [
      'Run bridge:sync with scoped credentials; check fresh source timestamps and complete GitHub coverage.',
      'Verify a Project Bridge import against isolated Supabase Storage and its RLS policies.',
      'Verify Vercel deployment permissions in an isolated client project, never the Avalon OS project.',
      'Verify Creative Bridge HMAC and machine permissions in staging before enabling any live delivery.',
    ],
  };
}

module.exports = { bridgeReadiness };
