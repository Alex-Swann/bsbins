export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { uprn, address, propertyType } = req.body;
  if (!uprn || !address || !propertyType) {
    res.status(400).json({ error: 'uprn, address, and propertyType are required' });
    return;
  }

  try {
    const apiRes = await fetch('https://api.east-herts.co.uk/api/property-details', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uprn, address, propertyType }),
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
