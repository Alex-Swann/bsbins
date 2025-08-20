import chromium from 'chrome-aws-lambda';
import puppeteer from 'puppeteer-core';

const SEARCH_PAGE_URL =
  'https://eastherts-self.achieveservice.com/AchieveForms/?mode=fill&consentMessage=yes&form_uri=sandbox-publish://AF-Process-98782935-6101-4962-9a55-5923e76057b6/AF-Stage-dcd0ec18-dfb4-496a-a266-bd8fadaa28a7/definition.json&process=1&process_uri=sandbox-processes://AF-Process-98782935-6101-4962-9a55-5923e76057b6&process_id=AF-Process-98782935-6101-4962-9a55-5923e76057b6';

async function getBrowser() {
  let executablePath = await chromium.executablePath;
  if (!executablePath) {
    const puppeteerPkg = await import('puppeteer');
    executablePath = puppeteerPkg.executablePath();
  }
  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: true,
  });
}

async function scrapeAddressAndBinDetails(postcode, houseNumber) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.goto(SEARCH_PAGE_URL, { waitUntil: 'networkidle2' });

    // Wait for the iframe to appear on the page
    await page.waitForSelector('iframe');

    // Get the iframe element handle and then the frame object
    const iframeElement = await page.$('iframe');
    if (!iframeElement) throw new Error('iframe not found on page');

    const frame = await iframeElement.contentFrame();
    if (!frame) throw new Error('Could not get iframe content');

    // Wait for postcode input inside the iframe
    await frame.waitForSelector('input[name="postcode_search"]', { timeout: 10000 });

    // Get the postcode input handle
    const postcodeInput = await frame.$('input[name="postcode_search"]');
    if (!postcodeInput) throw new Error('Postcode input not found inside iframe.');

    // Clear any existing value (3-click) and type postcode
    await postcodeInput.click({ clickCount: 3 });
    await postcodeInput.type(postcode);

    // Press Enter to submit
    await postcodeInput.press('Enter');

    // Wait for address dropdown to appear
    await frame.waitForSelector('select[name="listSelectAddress"]', { timeout: 10000 });
    // Wait a bit for options to populate (no waitForTimeout in puppeteer-core, fallback to evaluate + delay)
    await frame.evaluate(() => new Promise(resolve => setTimeout(resolve, 1500)));
// Wait a bit for options to populate (no waitForTimeout in puppeteer-core, fallback to evaluate + delay)
    await frame.evaluate(() => new Promise(resolve => setTimeout(resolve, 1500)));

    // Extract address options from dropdown
    const addressOptions = await frame.$$eval(
      'select[name="listSelectAddress"] option',
      opts => opts.map(opt => ({ value: opt.value, text: opt.textContent.trim() }))
    );

    if (addressOptions.length <= 1) {
      throw new Error('No addresses found for this postcode');
    }

    // Match house number in option text (case insensitive)
    const houseNumberStr = String(houseNumber).trim().toLowerCase();
    const matchingOption = addressOptions.find(opt =>
      opt.text.toLowerCase().includes(houseNumberStr)
    );

    if (!matchingOption) {
      throw new Error(`No address found matching house number "${houseNumber}"`);
    }

    // Select the matched address
    await frame.select('select[name="listSelectAddress"]', matchingOption.value);

    // Wait for bin collection input to appear and have value
    await frame.waitForFunction(() => {
      const recyclingDateInput = document.querySelector('input[name="RecyclingNextDate"]');
      return recyclingDateInput && recyclingDateInput.value.trim().length > 0;
    }, { timeout: 15000 });

    // Extract the data inside iframe
    const result = await frame.evaluate(() => {
      const uprnInput = document.querySelector('input[name="uprn"]');
      const uprn = uprnInput ? uprnInput.value : null;

      const addressSelect = document.querySelector('select[name="listSelectAddress"]');
      const selectedAddressText = addressSelect ? addressSelect.options[addressSelect.selectedIndex].text : null;

      const getVal = (name) => document.querySelector(`input[name="${name}"]`)?.value || null;

      const services = [];

      const binTypes = ['Recycling', 'Refuse', 'Paper', 'Food', 'GW'];
      const serviceNames = {
        Recycling: getVal('RecyclingServiceName'),
        Refuse: getVal('RefuseServiceName'),
        Paper: getVal('PaperServiceName'),
        Food: getVal('FoodServiceName'),
        GW: getVal('GWServiceName'),
      };

      binTypes.forEach((type, i) => {
        const binTypeNormalized = (() => {
          const lower = (type || '').toLowerCase();
          if (lower === 'gw') return 'garden';
          return lower;
        })();

        const serviceName = serviceNames[type];
        if (!serviceName) return;

        const collectionDateStr = getVal(`${type}NextDate`);
        if (!collectionDateStr) return;

        services.push({
          id: `puppeteer-${type}-${i}`,
          uprn: uprn || null,
          binType: binTypeNormalized,
          collectionDate: new Date(collectionDateStr).toISOString(),
          completed: false,
          roundId: null,
          serviceStatus: 'Active',
          issueCode: null,
          serviceId: null,
          serviceName,
          lastModified: new Date().toISOString(),
        });
      });

      return {
        uprn,
        address: selectedAddressText,
        postcode: getVal('postcode_search') || null,
        collections: services,
        rounds: [],
        environmentalIncidents: [],
        subscriptions: {
          subscriptions: [],
          gardenWasteSubscriptions: services.some(s => s.binType === 'garden') ? 1 : 0,
          gardenWasteActive: services.some(s => s.binType === 'garden'),
        },
        communalProperty: false,
        sackProperty: false,
        propertyType: 'individual',
      };
    });

    return result;
  } finally {
    await browser.close();
  }
}


export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { postcode, houseNumber } = req.body;
  if (!postcode) {
    res.status(400).json({ error: 'postcode required' });
    return;
  }
  if (!houseNumber) {
    res.status(400).json({ error: 'houseNumber required' });
    return;
  }

  try {
    const data = await scrapeAddressAndBinDetails(postcode, houseNumber);

    if (!data || !data.collections?.length) {
      return res.status(404).json({ error: 'No bin collection data found' });
    }

    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
