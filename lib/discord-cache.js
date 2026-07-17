// lib/discord-cache.js
//
// Shared org tree + Discord data cache. Imported by /api/agency and
// /api/ticker so a single warm Vercel instance only fetches Discord
// roles + members once per TTL window across both endpoints.

const GUILD_ID = process.env.DISCORD_GUILD_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

export const AGENCY_TREE = {
  'Blueprint Agency':  { parent: null,               children: ['The Foundation', 'The Standard'],                    label: 'Blueprint Agency' },
  'The Foundation':    { parent: 'Blueprint Agency', children: ['THE KEY AGENCY', 'Stark Financial', 'Ascend Financial'], label: 'The Foundation' },
  'The Standard':      { parent: 'Blueprint Agency', children: [],                                                    label: 'The Standard' },
  'THE KEY AGENCY':    { parent: 'The Foundation',   children: ['AA FINANCIAL', 'FORMULA FINANCIAL'],               label: 'The Key Agency' },
  'AA FINANCIAL':      { parent: 'THE KEY AGENCY',   children: ['Relentless Financial'],                            label: 'AA Financial' },
  'FORMULA FINANCIAL': { parent: 'THE KEY AGENCY',   children: [],                                                   label: 'Formula Financial' },
  'Relentless Financial': { parent: 'AA FINANCIAL',  children: [],                                                   label: 'Relentless Financial' },
  'Stark Financial':   { parent: 'The Foundation',   children: ['Pinpoint Financial'],                               label: 'Stark Financial' },
  'Pinpoint Financial': { parent: 'Stark Financial', children: [],                                                   label: 'Pinpoint Financial' },
  'Ascend Financial':  { parent: 'The Foundation',   children: [],                                                   label: 'Ascend Financial' },
};

export const OWNER_SELF = {
  'Agency Owner- Blueprint':         'Blueprint Agency',
  'Agency Owner- The Foundation':    'The Foundation',
  'Agency Owner- The Standard':      'The Standard',
  'Agency Owner- The Key':           'THE KEY AGENCY',
  'Agency Owner- AA FINANCIAL':      'AA FINANCIAL',
  'Agency Owner- Formula Financial': 'FORMULA FINANCIAL',
  'Agency Owner- Relentless Financial': 'Relentless Financial',
  'Agency Owner- Stark Financial':   'Stark Financial',
  'Agency Owner- Pinpoint Financial': 'Pinpoint Financial',
  'Agency Owner- Ascend Financial':  'Ascend Financial',
};

export function subtreeOf(node) {
  if (!AGENCY_TREE[node]) return [];
  const out = [node];
  for (const c of AGENCY_TREE[node].children) out.push(...subtreeOf(c));
  return out;
}

export function depthOf(node) {
  let d = 0;
  let cur = AGENCY_TREE[node]?.parent;
  while (cur) { d++; cur = AGENCY_TREE[cur].parent; }
  return d;
}

export function pathFromOwnerTo(ownerSelf, target) {
  const sub = new Set(subtreeOf(ownerSelf));
  if (!sub.has(target)) return null;
  const path = [];
  let cur = target;
  while (cur && cur !== ownerSelf) {
    path.unshift(cur);
    cur = AGENCY_TREE[cur].parent;
  }
  path.unshift(ownerSelf);
  return path;
}

// ---------- Discord roles + members cache ----------

let DISCORD_CACHE = { at: 0, data: null, pending: null };
const DISCORD_CACHE_TTL_MS = 60 * 1000;

async function fetchAllDiscordData() {
  const rolesP = fetch(`https://discord.com/api/guilds/${GUILD_ID}/roles`, {
    headers: { Authorization: `Bot ${BOT_TOKEN}` },
  }).then(r => r.ok ? r.json() : null);

  const membersP = (async () => {
    let all = [];
    let after = '0';
    while (true) {
      const r = await fetch(
        `https://discord.com/api/guilds/${GUILD_ID}/members?limit=1000&after=${after}`,
        { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
      );
      if (!r.ok) break;
      const m = await r.json();
      if (!m.length) break;
      all = all.concat(m);
      if (m.length < 1000) break;
      after = m[m.length - 1].user.id;
    }
    return all;
  })();

  const [allRoles, allMembers] = await Promise.all([rolesP, membersP]);
  if (!allRoles) throw new Error('Failed to fetch Discord roles');

  const roleIdMap = {};
  const roleIcons = {};
  allRoles.forEach(r => {
    roleIdMap[r.name] = r.id;
    if (r.icon) {
      roleIcons[r.name] = `https://cdn.discordapp.com/role-icons/${r.id}/${r.icon}.png?size=128`;
    }
  });
  return { allRoles, roleIdMap, roleIcons, allMembers };
}

export async function getDiscordData() {
  if (DISCORD_CACHE.data && Date.now() - DISCORD_CACHE.at < DISCORD_CACHE_TTL_MS) {
    return DISCORD_CACHE.data;
  }
  if (DISCORD_CACHE.pending) return DISCORD_CACHE.pending;
  DISCORD_CACHE.pending = (async () => {
    try {
      const data = await fetchAllDiscordData();
      DISCORD_CACHE = { at: Date.now(), data, pending: null };
      return data;
    } catch (e) {
      DISCORD_CACHE.pending = null;
      throw e;
    }
  })();
  return DISCORD_CACHE.pending;
}

// Build a canonical { discord_id -> { display_name, avatar } } map from raw
// guild members. Used by both endpoints.
export function buildMemberInfo(allMembers, scopeRoleIds) {
  // scopeRoleIds: Set of role IDs we care about (the agency roles in scope).
  // Returns: { id: { discord_id, display_name, avatar, roleNames: Set } }
  const out = {};
  for (const m of allMembers) {
    let hasScope = false;
    const roleNames = new Set();
    for (const rid of m.roles) {
      if (scopeRoleIds.has(rid)) { hasScope = true; roleNames.add(rid); }
    }
    if (!hasScope) continue;
    out[m.user.id] = {
      discord_id: m.user.id,
      display_name: m.nick || m.user.global_name || m.user.username,
      avatar: m.avatar
        ? `https://cdn.discordapp.com/guilds/${GUILD_ID}/users/${m.user.id}/avatars/${m.avatar}.png`
        : m.user.avatar
          ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png`
          : null,
      roleIds: roleNames,
    };
  }
  return out;
}
