import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

const SEARCH_PAGE_URL =
  'https://eastherts-self.achieveservice.com/AchieveForms/?mode=fill&consentMessage=yes&form_uri=sandbox-publish://AF-Process-98782935-6101-4962-9a55-5923e76057b6/AF-Stage-dcd0ec18-dfb4-496a-a266-bd8fadaa28a7/definition.json&process=1&process_uri=sandbox-processes://AF-Process-98782935-6101-4962-9a55-5923e76057b6&process_id=AF-Process-98782935-6101-4962-9a55-5923e76057b6';

export async function getBrowser() {
  const isServerless = process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL;
  let executablePath = undefined;
  let launchArgs = [];
  let headless = true;
  let defaultViewport = { width: 1280, height: 800 };

  if (isServerless) {
    // Use chrome-aws-lambda / sparticuz-chromium for serverless
    executablePath = await chromium.executablePath();
    launchArgs = [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'];
    headless = chromium.headless;
    defaultViewport = chromium.defaultViewport;

    if (!executablePath) {
      throw new Error('Chromium not found in serverless environment.');
    }
  } else {
    // Local development
    const puppeteerPkg = await import('puppeteer');
    executablePath = puppeteerPkg.executablePath();
    launchArgs = ['--no-sandbox', '--disable-setuid-sandbox']; // optional locally
  }

  return puppeteer.launch({
    args: launchArgs,
    defaultViewport,
    executablePath,
    headless,
    ignoreHTTPSErrors: true,
  });
}

async function scrapeAddressAndBinDetails(postcode, houseNumber) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.goto(SEARCH_PAGE_URL, { waitUntil: 'networkidle2' });
    await page.waitForSelector('iframe');

    const iframeElement = await page.$('iframe');
    const frame = await iframeElement?.contentFrame();
    if (!frame) throw new Error('Could not get iframe content');

    await frame.waitForSelector('input[name="postcode_search"]', { timeout: 10000 });
    const postcodeInput = await frame.$('input[name="postcode_search"]');
    await postcodeInput.click({ clickCount: 3 });
    await postcodeInput.type(postcode);
    await postcodeInput.press('Enter');

    await frame.waitForSelector('select[name="listSelectAddress"]', { timeout: 10000 });
    await frame.evaluate(() => new Promise(resolve => setTimeout(resolve, 1500)));

    const addressOptions = await frame.$$eval(
      'select[name="listSelectAddress"] option',
      opts => opts.map(opt => ({ value: opt.value, text: opt.textContent.trim() }))
    );

    const houseNumberStr = String(houseNumber).trim().toLowerCase();
    const matchingOption = addressOptions.find(opt => opt.text.toLowerCase().includes(houseNumberStr));
    if (!matchingOption) throw new Error(`No address found matching house number "${houseNumber}"`);

    await frame.select('select[name="listSelectAddress"]', matchingOption.value);

    await frame.waitForFunction(() => {
      const recyclingDateInput = document.querySelector('input[name="RecyclingNextDate"]');
      return recyclingDateInput && recyclingDateInput.value.trim().length > 0;
    }, { timeout: 15000 });

    const result = await frame.evaluate(() => {
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
        const binTypeNormalized = type.toLowerCase() === 'gw' ? 'garden' : type.toLowerCase();
        const serviceName = serviceNames[type];
        const collectionDateStr = getVal(`${type}NextDate`);
        if (!serviceName || !collectionDateStr) return;

        services.push({
          id: `puppeteer-${type}-${i}`,
          binType: binTypeNormalized,
          collectionDate: new Date(collectionDateStr).toISOString(),
          serviceName,
          serviceStatus: 'Active',
        });
      });

      const uprn = getVal('uprn');
      const addressSelect = document.querySelector('select[name="listSelectAddress"]');
      const selectedAddressText = addressSelect?.options[addressSelect.selectedIndex].text || null;

      return {
        uprn,
        address: selectedAddressText,
        postcode: getVal('postcode_search') || null,
        collections: services,
      };
    });

    return result;
  } finally {
    await browser.close();
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { postcode, houseNumber } = req.body;
  if (!postcode) return res.status(400).json({ error: 'postcode required' });
  if (!houseNumber) return res.status(400).json({ error: 'houseNumber required' });

  try {
    const data = await scrapeAddressAndBinDetails(postcode, houseNumber);
    if (!data?.collections?.length) return res.status(404).json({ error: 'No bin collection data found' });

    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
