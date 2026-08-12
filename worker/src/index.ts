import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Bindings = {
  DB: D1Database;
  TURNSTILE_SECRET_KEY?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS for frontend domain (GitHub Pages and localhost)
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Admin-Token'],
}));

// Simple SHA-256 helper for security hashing
async function hashString(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Generate random UUID / NanoID string
function generateId(length: number = 10): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => chars[byte % chars.length]).join('');
}

// Verify Cloudflare Turnstile token
async function verifyTurnstile(token: string | undefined, secretKey?: string, ip?: string): Promise<boolean> {
  if (!secretKey || secretKey.trim() === '') {
    // Turnstile disabled in dev if secret key is not provided
    return true;
  }
  if (!token) return false;

  try {
    const formData = new FormData();
    formData.append('secret', secretKey);
    formData.append('response', token);
    if (ip) formData.append('remoteip', ip);

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });
    const outcome = (await res.json()) as { success: boolean };
    return outcome.success;
  } catch (err) {
    console.error('Turnstile verification error:', err);
    return false;
  }
}

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }));

// 1. Create a new poll
app.post('/api/polls', async (c) => {
  const body = await c.req.json<{
    title: string;
    description?: string;
    options: string[];
    cfTurnstileToken?: string;
  }>();

  if (!body.title || !body.title.trim()) {
    return c.json({ error: 'Otsikko on pakollinen' }, 400);
  }
  if (!body.options || !Array.isArray(body.options) || body.options.length === 0) {
    return c.json({ error: 'Lisää vähintään yksi aikaehdotus' }, 400);
  }

  // Turnstile check
  const clientIp = c.req.header('cf-connecting-ip') || '127.0.0.1';
  const isValidCaptcha = await verifyTurnstile(body.cfTurnstileToken, c.env.TURNSTILE_SECRET_KEY, clientIp);
  if (!isValidCaptcha) {
    return c.json({ error: 'Spam-suojaus epäonnistui. Yritä uudelleen.' }, 403);
  }

  const pollId = generateId(12);
  const adminToken = generateId(24);
  const adminTokenHash = await hashString(adminToken);

  try {
    // Insert poll
    await c.env.DB.prepare(
      'INSERT INTO polls (id, title, description, admin_token_hash) VALUES (?, ?, ?, ?)'
    ).bind(pollId, body.title.trim(), body.description?.trim() || null, adminTokenHash).run();

    // Insert options
    const optionStatements = body.options
      .map(opt => opt.trim())
      .filter(opt => opt.length > 0)
      .map((opt, index) => {
        const optionId = generateId(10);
        return c.env.DB.prepare(
          'INSERT INTO options (id, poll_id, option_text, sort_order) VALUES (?, ?, ?, ?)'
        ).bind(optionId, pollId, opt, index);
      });

    if (optionStatements.length > 0) {
      await c.env.DB.batch(optionStatements);
    }

    return c.json({
      success: true,
      pollId,
      adminToken, // Private key returned ONLY to creator
    });
  } catch (err: any) {
    console.error('Error creating poll:', err);
    return c.json({ error: 'Tietokantavirhe kyselyä luotaessa' }, 500);
  }
});

// 2. Fetch poll by ID
app.get('/api/polls/:id', async (c) => {
  const pollId = c.req.param('id');

  try {
    // Fetch poll metadata
    const poll = await c.env.DB.prepare(
      'SELECT id, title, description, is_closed, final_option_id, created_at FROM polls WHERE id = ?'
    ).bind(pollId).first<{
      id: string;
      title: string;
      description: string | null;
      is_closed: number;
      final_option_id: string | null;
      created_at: string;
    }>();

    if (!poll) {
      return c.json({ error: 'Kyselyä ei löytynyt' }, 404);
    }

    // Fetch options
    const optionsRes = await c.env.DB.prepare(
      'SELECT id, option_text, sort_order FROM options WHERE poll_id = ? ORDER BY sort_order ASC'
    ).bind(pollId).all<{ id: string; option_text: string; sort_order: number }>();

    // Fetch voters and votes
    const votersRes = await c.env.DB.prepare(
      'SELECT id, voter_name, voter_token, updated_at FROM voters WHERE poll_id = ? ORDER BY updated_at ASC'
    ).bind(pollId).all<{ id: string; voter_name: string; voter_token: string; updated_at: string }>();

    const votesRes = await c.env.DB.prepare(
      `SELECT v.voter_id, v.option_id, v.decision 
       FROM votes v 
       JOIN voters vr ON v.voter_id = vr.id 
       WHERE vr.poll_id = ?`
    ).bind(pollId).all<{ voter_id: string; option_id: string; decision: string }>();

    // Organize votes matrix
    const options = optionsRes.results || [];
    const voters = (votersRes.results || []).map(v => {
      const voterVotes: Record<string, string> = {};
      (votesRes.results || []).filter(vt => vt.voter_id === v.id).forEach(vt => {
        voterVotes[vt.option_id] = vt.decision;
      });
      return {
        id: v.id,
        name: v.voter_name,
        token: v.voter_token,
        votes: voterVotes,
        updatedAt: v.updated_at
      };
    });

    return c.json({
      poll: {
        id: poll.id,
        title: poll.title,
        description: poll.description,
        isClosed: Boolean(poll.is_closed),
        finalOptionId: poll.final_option_id,
        createdAt: poll.created_at
      },
      options,
      voters
    });
  } catch (err: any) {
    console.error('Error fetching poll:', err);
    return c.json({ error: 'Virhe haettaessa kyselyä' }, 500);
  }
});

// 3. Vote on a poll
app.post('/api/polls/:id/vote', async (c) => {
  const pollId = c.req.param('id');
  const body = await c.req.json<{
    voterName: string;
    voterToken?: string;
    votes: Record<string, 'yes' | 'no' | 'maybe'>;
    cfTurnstileToken?: string;
  }>();

  if (!body.voterName || !body.voterName.trim()) {
    return c.json({ error: 'Nimi on pakollinen' }, 400);
  }

  // Turnstile check
  const clientIp = c.req.header('cf-connecting-ip') || '127.0.0.1';
  const isValidCaptcha = await verifyTurnstile(body.cfTurnstileToken, c.env.TURNSTILE_SECRET_KEY, clientIp);
  if (!isValidCaptcha) {
    return c.json({ error: 'Spam-suojaus epäonnistui' }, 403);
  }

  try {
    // Check if poll exists and is open
    const poll = await c.env.DB.prepare('SELECT is_closed FROM polls WHERE id = ?').bind(pollId).first<{ is_closed: number }>();
    if (!poll) {
      return c.json({ error: 'Kyselyä ei löytynyt' }, 404);
    }
    if (poll.is_closed) {
      return c.json({ error: 'Tämä kysely on lukittu ja äänestys on päättynyt' }, 400);
    }

    let voterToken = body.voterToken;
    let voterId: string;

    // Check if voter already exists with voterToken or name in this poll
    const existingVoter = voterToken 
      ? await c.env.DB.prepare('SELECT id FROM voters WHERE poll_id = ? AND voter_token = ?').bind(pollId, voterToken).first<{ id: string }>()
      : null;

    const ipHash = await hashString(clientIp);

    if (existingVoter) {
      voterId = existingVoter.id;
      // Update voter name & timestamp
      await c.env.DB.prepare('UPDATE voters SET voter_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(body.voterName.trim(), voterId).run();
      // Clear old votes
      await c.env.DB.prepare('DELETE FROM votes WHERE voter_id = ?').bind(voterId).run();
    } else {
      voterId = generateId(12);
      voterToken = voterToken || generateId(20);
      await c.env.DB.prepare(
        'INSERT INTO voters (id, poll_id, voter_name, voter_token, ip_hash) VALUES (?, ?, ?, ?, ?)'
      ).bind(voterId, pollId, body.voterName.trim(), voterToken, ipHash).run();
    }

    // Insert votes
    const voteStatements = Object.entries(body.votes || {}).map(([optionId, decision]) => {
      return c.env.DB.prepare('INSERT INTO votes (voter_id, option_id, decision) VALUES (?, ?, ?)')
        .bind(voterId, optionId, decision);
    });

    if (voteStatements.length > 0) {
      await c.env.DB.batch(voteStatements);
    }

    return c.json({
      success: true,
      voterId,
      voterToken
    });
  } catch (err: any) {
    console.error('Error voting:', err);
    return c.json({ error: 'Virhe tallennettaessa ääntä' }, 500);
  }
});

// 4. Lock poll / select final option (Requires Admin Token)
app.post('/api/polls/:id/lock', async (c) => {
  const pollId = c.req.param('id');
  const adminToken = c.req.header('X-Admin-Token');
  const body = await c.req.json<{ finalOptionId?: string; isClosed: boolean }>();

  if (!adminToken) {
    return c.json({ error: 'Ylläpitäjän avain puuttuu' }, 401);
  }

  const adminTokenHash = await hashString(adminToken);

  try {
    const poll = await c.env.DB.prepare(
      'SELECT admin_token_hash FROM polls WHERE id = ?'
    ).bind(pollId).first<{ admin_token_hash: string }>();

    if (!poll || poll.admin_token_hash !== adminTokenHash) {
      return c.json({ error: 'Virheellinen ylläpitäjän avain' }, 403);
    }

    await c.env.DB.prepare(
      'UPDATE polls SET is_closed = ?, final_option_id = ? WHERE id = ?'
    ).bind(body.isClosed ? 1 : 0, body.finalOptionId || null, pollId).run();

    return c.json({ success: true });
  } catch (err: any) {
    console.error('Error locking poll:', err);
    return c.json({ error: 'Virhe päivitettäessä kyselyä' }, 500);
  }
});

export default app;
