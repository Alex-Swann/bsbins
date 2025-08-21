import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

const PAGE_URL =
  'https://www.hertfordshire.gov.uk/services/recycling-waste-and-environment/recycling-and-waste/where-can-i-recycle/household-waste-recycling-centres/bishops-stortford-household-waste-recycling-centre.aspx';

const FALLBACK_SITE_ID = '69b21282-369d-4d98-ab6d-0bc3591213b4';
const OLD_ACCESS_TOKEN = 'ZnlyviS9DcLiTnTUoJCLTgryTr1buC1KtAwYSX32f64A0RM5';

export async function getBrowser() {
  const isServerless = process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL;
  let executablePath = undefined;
  let launchArgs = [];
  let headless = true;
  let defaultViewport = { width: 1280, height: 800 };

  if (isServerless) {
    // Use chrome-aws-lambda / sparticuz-chromium for serverless
    executablePath = await chromium.executablePath();

    if (!require('fs').existsSync(executablePath)) {
      throw new Error(`Chromium not found at ${executablePath}`);
    }

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

async function getBinStatusViaPage() {
  const browser = await getBrowser();
  const page = await browser.newPage();

  await page.goto(PAGE_URL, { waitUntil: 'networkidle0', timeout: 20000 });

  try {
    await page.waitForSelector('#ccc-recommended-settings', { timeout: 10000 });
    await page.click('#ccc-recommended-settings');
    await page.waitForTimeout(1000);
  } catch {}

  const siteID = await page.$eval('#HWRCID', el => el.dataset.value).catch(() => FALLBACK_SITE_ID);

  const binStatus = await page.evaluate(async (siteID, oldToken) => {
    if (!window.Zengenti?.Contensis?.Client) return null;

    const accessToken = window.Zengenti.Contensis.Client._config?.accessToken || oldToken;

    const client = window.Zengenti.Contensis.Client.create({
      rootUrl: 'https://cms-hcc.cloud.contensis.com',
      accessToken,
      projectId: 'website',
      language: 'en-GB',
      versionStatus: 'published',
      pageSize: 10,
    });

    try {
      const data = await client.entries.get(siteID);
      return data;
    } catch {
      return null;
    }
  }, siteID, OLD_ACCESS_TOKEN);

  await browser.close();
  return { siteID, binStatus };
}

export default async function handler(req, res) {
  try {
    const { siteID, binStatus } = await getBinStatusViaPage();

    if (!siteID || !binStatus) {
      return res.status(500).json({ error: 'Failed to retrieve siteID or bin status' });
    }

    res.status(200).json({ siteID, binStatus });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
