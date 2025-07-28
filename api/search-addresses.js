export default async function handler(req, res) {
  const response = await fetch('https://api.east-herts.co.uk/api/search-addresses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body)
  });

  const data = await response.json();
  res.status(response.status).json(data);
}
