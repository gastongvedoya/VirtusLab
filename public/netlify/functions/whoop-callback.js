exports.handler = async (event) => {
  const WHOOP_CLIENT_ID = '708dc8a7-b891-46ab-af98-5d5049a1502c';
  const WHOOP_CLIENT_SECRET = 'b8514a3ff88614a44bded3215c43079f48fd28a843ee37535baefc2b586f966c';
  const REDIRECT_URI = 'https://virtuslab1.netlify.app/.netlify/functions/whoop-callback';

  const params = event.queryStringParameters || {};
  const code = params.code;

  if (!code) {
    return { statusCode: 302, headers: { Location: '/?error=no_code' } };
  }

  try {
    const tokenResponse = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        client_id: WHOOP_CLIENT_ID,
        client_secret: WHOOP_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
      }).toString()
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      return { statusCode: 302, headers: { Location: '/?error=token_exchange&detail=' + encodeURIComponent(tokenData.error) } };
    }

    const fragment = 'access_token=' + tokenData.access_token + '&refresh_token=' + tokenData.refresh_token + '&expires_in=' + tokenData.expires_in;
    return { statusCode: 302, headers: { Location: '/?whoop_auth=success#' + fragment } };

  } catch (err) {
    return { statusCode: 302, headers: { Location: '/?error=server_error&detail=' + encodeURIComponent(err.message) } };
  }
};
