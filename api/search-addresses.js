export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const { postcode } = req.body;
  if (!postcode) {
    res.status(400).json({ error: 'postcode required' });
    return;
  }

  try {
    const apiRes = await fetch('https://api.east-herts.co.uk/api/search-addresses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postcode }),
    });
    if (!apiRes.ok) {
      const text = await apiRes.text();
      throw new Error(`API Error: ${apiRes.status} ${text}`);
    }
    const data = await apiRes.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
