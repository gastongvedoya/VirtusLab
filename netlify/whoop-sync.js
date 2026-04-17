// WHOOP Data Sync — fetches last 90 days from WHOOP API
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
 
  const WHOOP_CLIENT_ID = '708dc8a7-b891-46ab-af98-5d5049a1502c';
  const WHOOP_CLIENT_SECRET = process.env.WHOOP_CLIENT_SECRET || 'b8514a3ff88614a44bded3215c43079f48fd28a843ee37535baefc2b586f966c';
 
  try {
    const body = JSON.parse(event.body);
    let { access_token, refresh_token, expires_at } = body;
 
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
        return {
          statusCode: 401,
          body: JSON.stringify({ error: 'refresh_failed', detail: refreshData.error })
        };
      }
      access_token = refreshData.access_token;
      newTokens = {
        access_token: refreshData.access_token,
        refresh_token: refreshData.refresh_token,
        expires_in: refreshData.expires_in,
        expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString()
      };
    }
 
    const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const headers = { 'Authorization': 'Bearer ' + access_token };
 
    async function fetchAllPages(basePath) {
      const all = [];
      let nextToken = null;
      let pages = 0;
      do {
        let url = 'https://api.prod.whoop.com/developer' + basePath
          + '?start=' + encodeURIComponent(startDate) + '&limit=25';
        if (nextToken) url += '&nextToken=' + encodeURIComponent(nextToken);
        const resp = await fetch(url, { headers });
        if (!resp.ok) {
          return { records: all, error: 'API error ' + resp.status };
        }
        const data = await resp.json();
        if (data.records && Array.isArray(data.records)) all.push(...data.records);
        nextToken = data.next_token || null;
        pages++;
        if (pages > 10) break;
      } while (nextToken);
      return { records: all };
    }
 
    async function fetchOne(path) {
      const resp = await fetch('https://api.prod.whoop.com/developer' + path, { headers });
      if (!resp.ok) return null;
      return await resp.json();
    }
 
    const [recovery, sleep, cycles, profile] = await Promise.all([
      fetchAllPages('/v2/recovery'),
      fetchAllPages('/v2/activity/sleep'),
      fetchAllPages('/v2/cycle'),
      fetchOne('/v2/user/profile/basic'),
    ]);
 
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recovery: recovery.records || [],
        sleep: sleep.records || [],
        cycles: cycles.records || [],
        profile: profile || null,
        newTokens,
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'server_error', detail: err.message })
    };
  }
};
