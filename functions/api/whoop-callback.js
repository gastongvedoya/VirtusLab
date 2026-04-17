// Cloudflare Pages Function: /api/whoop-callback
// Handles OAuth callback from WHOOP, exchanges code for tokens, redirects back to portal

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  const origin = url.origin;

  if (error) {
    return Response.redirect(origin + '/?whoop_error=' + encodeURIComponent(error), 302);
  }

  if (!code) {
    return Response.redirect(origin + '/?whoop_error=no_code', 302);
  }

  const WHOOP_CLIENT_ID = '708dc8a7-b891-46ab-af98-5d5049a1502c';
  const WHOOP_CLIENT_SECRET = env.WHOOP_CLIENT_SECRET || 'b8514a3ff88614a44bded3215c43079f48fd28a843ee37535baefc2b586f966c';
  const REDIRECT_URI = origin + '/api/whoop-callback';

  try {
    const tokenResp = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI,
        client_id: WHOOP_CLIENT_ID,
        client_secret: WHOOP_CLIENT_SECRET,
      }).toString()
    });

    const tokenData = await tokenResp.json();

    if (tokenData.error) {
      return Response.redirect(origin + '/?whoop_error=' + encodeURIComponent(tokenData.error), 302);
    }

    // Redirect back with tokens in hash (not query) so they don't hit server logs
    const hash = '#access_token=' + tokenData.access_token
      + '&refresh_token=' + tokenData.refresh_token
      + '&expires_in=' + tokenData.expires_in;

    return Response.redirect(origin + '/?whoop_auth=success' + hash, 302);
  } catch (err) {
    return Response.redirect(origin + '/?whoop_error=' + encodeURIComponent(err.message), 302);
  }
}
