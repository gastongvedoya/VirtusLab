// Cloudflare Pages Function: /api/claude-proxy
// POST body: { messages: [...], system: "...", max_tokens: 1024 }

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const apiKey = env.CLAUDE_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'CLAUDE_API_KEY not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: body.model || 'claude-haiku-4-5-20251001',
        max_tokens: body.max_tokens || 1024,
        system: body.system || '',
        messages: body.messages || []
      })
    });

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'proxy_error', detail: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
