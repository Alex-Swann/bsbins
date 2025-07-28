export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  function transformOldApiRes(oldApiJson) {
    if (!oldApiJson?.services?.length) return null;

    const services = oldApiJson.services;

    // Group by UPRN (they should all be the same)
    const uprn = services[0].uprn;
    const address = services[0].address;
    const postcode = services[0].postcode;

    // Track if garden waste service is active (assume it is if present)
    const gardenWasteServices = services.filter(s => s.serviceType.toLowerCase().includes('garden waste'));

    const collections = services.map((service, index) => ({
        id: `legacy-${index}`, // unique enough
        uprn: service.uprn,
        binType: normalizeBinType(service.binType), // normalize to lowercase or expected keys
        collectionDate: new Date(service.collectionDate).toISOString(),
        completed: false,
        roundId: null,
        serviceStatus: "Active",
        issueCode: null,
        serviceId: null, // no mapping in old API
        serviceName: service.serviceType,
        lastModified: new Date().toISOString()
    }));

    return {
        uprn,
        address,
        postcode,
        collections,
        rounds: [],
        environmentalIncidents: [],
        subscriptions: {
        subscriptions: [],
        gardenWasteSubscriptions: gardenWasteServices.length > 0 ? 1 : 0,
        gardenWasteActive: gardenWasteServices.length > 0
        },
        communalProperty: false,
        sackProperty: false,
        propertyType: "individual"
    };
    }

    function normalizeBinType(binType) {
        const lower = binType.toLowerCase();
        if (lower.includes("purple")) return "purple";
        if (lower.includes("black")) return "black";
        if (lower.includes("blue") && lower.includes("lid")) return "blue";
        if (lower.includes("blue") && lower.includes("box")) return "blue-box";
        if (lower.includes("brown")) return "brown";
        if (lower.includes("food")) return "food";
        return "unknown";
    }

  const { uprn, address, propertyType } = req.body;
  if (!uprn || !address || !propertyType) {
    res.status(400).json({ error: 'uprn, address, and propertyType are required' });
    return;
  }

  try {
    // const apiRes = await fetch('https://api.east-herts.co.uk/api/property-details', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ uprn, address, propertyType }),
    // });

    const apiRes = await fetch(`https://east-herts.co.uk/api/services/${uprn}`);

    if (!apiRes.ok) {
      const text = await apiRes.text();
      throw new Error(`API Error: ${apiRes.status} ${text}`);
    }
    // const data = await apiRes.json();
    const data = await apiRes.json();
    
    res.status(200).json(transformOldApiRes(data));
  } catch (err) {
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
