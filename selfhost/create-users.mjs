// Creates or repairs one user on the self-hosted backend.
// Usage:
//   SUPABASE_URL=https://supabase.neocast.cc SERVICE_KEY=xxxx \
//     node create-users.mjs <email> <password> [role]
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SERVICE_KEY;
if (!URL_ || !KEY) throw new Error('SUPABASE_URL and SERVICE_KEY required');

// Required CLI args: node create-users.mjs <email> <password> [role]
// No default accounts and no hardcoded passwords — credentials must be passed in.
const [argEmail, argPass, argRole] = process.argv.slice(2);
if (!argEmail || !argPass) {
  throw new Error('usage: node create-users.mjs <email> <password> [role]');
}
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const email = argEmail.trim().toLowerCase();
const role = argRole || 'buyer';

async function responseError(response) {
  const text = await response.text();
  try {
    const body = JSON.parse(text);
    return body.msg || body.message || body.error || text;
  } catch {
    return text || `HTTP ${response.status}`;
  }
}

async function findUserByEmail(targetEmail) {
  for (let page = 1; page <= 100; page += 1) {
    const response = await fetch(`${URL_}/auth/v1/admin/users?page=${page}&per_page=100`, { headers });
    if (!response.ok) throw new Error(`Could not list users: ${await responseError(response)}`);
    const payload = await response.json();
    const users = Array.isArray(payload) ? payload : payload.users || [];
    const match = users.find((user) => user.email?.toLowerCase() === targetEmail);
    if (match) return match;
    if (users.length < 100) return null;
  }
  return null;
}

let user = await findUserByEmail(email);
if (user) {
  const response = await fetch(`${URL_}/auth/v1/admin/users/${user.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ password: argPass, email_confirm: true, ban_duration: 'none' }),
  });
  if (!response.ok) throw new Error(`Could not repair ${email}: ${await responseError(response)}`);
  user = await response.json();
  console.log(`+ updated password and confirmed ${email} (${user.id})`);
} else {
  const response = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, password: argPass, email_confirm: true }),
  });
  if (!response.ok) throw new Error(`Could not create ${email}: ${await responseError(response)}`);
  user = await response.json();
  console.log(`+ created and confirmed ${email} (${user.id})`);
}

const roles = role === 'superadmin' ? ['admin', 'superadmin'] : [role];
for (const assignedRole of roles) {
  const response = await fetch(`${URL_}/rest/v1/user_roles`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify({ user_id: user.id, role: assignedRole }),
  });
  if (!response.ok) throw new Error(`Could not grant ${assignedRole}: ${await responseError(response)}`);
  console.log(`  ${assignedRole} role: ok`);
}

// Verify the exact password against the same public auth endpoint used by the app.
const verify = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ email, password: argPass }),
});
if (!verify.ok) throw new Error(`Login verification failed: ${await responseError(verify)}`);
console.log(`+ login verified for ${email}`);
