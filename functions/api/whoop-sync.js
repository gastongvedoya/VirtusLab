// Cloudflare Pages Function: /api/whoop-sync
// Fetches ONE type of data at a time (recovery, sleep, or cycles) for last 30 days
// Body: { access_token, refresh_token, expires_at, type: 'recovery' | 'sleep' | 'cycles' }

export async function onRequestPost(context) {
  const { request, env } = context;

  const WHOOP_CLIENT_ID = '708dc8a7-b891-46ab-af98-5d5049a1502c';
  const WHOOP_CLIENT_SECRET = env.WHOOP_CLIENT_SECRET || 'b8514a3ff88614a44bded3215c43079f48fd28a843ee37535baefc2b586f966c';

  try {
    const body = await request.json();
    let { access_token, refresh_token, expires_at, type } = body;

    if (!type || !['recovery', 'sleep', 'cycles', 'profile'].includes(type)) {
      return new Response(JSON.stringify({ error: 'invalid_type' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if token needs refresh
    const now = Date.now();
    const expiresAt = expires_at ? new Date(expires_at).getTime() : 0;
    const needsRefresh = !expires_at || (expiresAt - now) < 5 * 60 * 1000;

    let newTokens = null;

    if (needsRefresh && refresh_token) {
      const refreshResp = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refresh_token,
          client_id: WHOOP_CLIENT_ID,
          client_secret: WHOOP_CLIENT_SECRET,
          scope: 'offline',
        }).toString()
      });
      const refreshData = await refreshResp.json();
      if (refreshData.error) {
        return new Response(JSON.stringify({ error: 'refresh_failed', detail: refreshData.error }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      access_token = refreshData.access_token;
      newTokens = {
        access_token: refreshData.access_token,
        refresh_token: refreshData.refresh_token,
        expires_in: refreshData.expires_in,
        expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString()
      };
    }

    const headers = { 'Authorization': 'Bearer ' + access_token };

    // 30 days is faster and avoids Cloudflare timeout
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Profile endpoint is just one call
    if (type === 'profile') {
      const resp = await fetch('https://api.prod.whoop.com/developer/v2/user/profile/basic', { headers });
      if (!resp.ok) {
        return new Response(JSON.stringify({ error: 'api_error', status: resp.status }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const data = await resp.json();
      return new Response(JSON.stringify({ profile: data, newTokens }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Map type to API path
    const pathMap = {
      recovery: '/v2/recovery',
      sleep: '/v2/activity/sleep',
      cycles: '/v2/cycle',
    };
    const basePath = pathMap[type];

    // Paginate
    const records = [];
    let nextToken = null;
    let pages = 0;
    const MAX_PAGES = 6; // 6 * 25 = 150 records max, enough for 30 days

    do {
      let url = 'https://api.prod.whoop.com/developer' + basePath
        + '?start=' + encodeURIComponent(startDate) + '&limit=25';
      if (nextToken) url += '&nextToken=' + encodeURIComponent(nextToken);
      const resp = await fetch(url, { headers });
      if (!resp.ok) {
        return new Response(JSON.stringify({
          error: 'api_error', status: resp.status, records, type
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const data = await resp.json();
      if (data.records && Array.isArray(data.records)) records.push(...data.records);
      nextToken = data.next_token || null;
      pages++;
    } while (nextToken && pages < MAX_PAGES);

    return new Response(JSON.stringify({
      records,
      type,
      newTokens,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'server_error', detail: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
