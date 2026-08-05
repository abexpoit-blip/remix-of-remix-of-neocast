// Creates the admin + demo user on the self-hosted Supabase.
// Usage:
//   SUPABASE_URL=https://supabase.neocast.cc SERVICE_KEY=xxxx node create-users.mjs
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SERVICE_KEY;
if (!URL_ || !KEY) throw new Error('SUPABASE_URL and SERVICE_KEY required');

// Required CLI args: node create-users.mjs <email> <password> [role]
// No default accounts and no hardcoded passwords — credentials must be passed in.
const [argEmail, argPass, argRole] = process.argv.slice(2);
if (!argEmail || !argPass) {
  throw new Error('usage: node create-users.mjs <email> <password> [role]');
}
const users = [{ email: argEmail, password: argPass, role: argRole || 'buyer' }];

for (const u of users) {
  const res = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: u.email, password: u.password, email_confirm: true }),
  });
  const body = await res.json();
  if (!res.ok) {
    console.log(`- ${u.email}: ${body.msg || body.message || JSON.stringify(body)}`);
    continue;
  }
  console.log(`+ created ${u.email} (${body.id}) password: ${u.password}`);
  if (u.role === 'admin') {
    const r = await fetch(`${URL_}/rest/v1/user_roles`, {
      method: 'POST',
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates',
      },
      body: JSON.stringify({ user_id: body.id, role: 'admin' }),
    });
    console.log(`  admin role: ${r.ok ? 'ok' : await r.text()}`);
  }
}
