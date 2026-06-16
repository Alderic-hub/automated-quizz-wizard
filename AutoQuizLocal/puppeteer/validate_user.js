import puppeteer from 'puppeteer';

const LOGIN_URL = 'https://elearning.gyaschool.net/login/index.php';
const EMAIL_SELECTOR = '#username';
const PASSWORD_SELECTOR = '#password';
const LOGIN_BUTTON_SELECTOR = '#loginbtn';
const LOGIN_ERROR_SELECTOR = '.login-heading h3';

/**
 * Validate credentials by attempting a login.
 * @param {string} email
 * @param {string} password
 * @param {object} options optional { headless: boolean, timeoutMs: number, keepBrowserOpen: boolean, debug: boolean }
 * @returns {Promise<{success: boolean, message?: string, page?: any, browser?: any}>}
 */
export async function validateCredentials(email, password, options = {}) {
  const timeoutMs = options.timeoutMs ?? 150000; // 15s
  const headless = options.headless !== false;  // default true
  const keepBrowserOpen = options.keepBrowserOpen === true;
  const debug = options.debug === true;

  let browser;

  try {
    browser = await puppeteer.launch({
      headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    if (debug) console.log('Browser opened');

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(timeoutMs);

    // Go to login page
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded'});
    if (debug) console.log('Website loaded');

    // Fill email & password
    await page.waitForSelector(EMAIL_SELECTOR, { timeout: 5000 });
    await page.type(EMAIL_SELECTOR, String(email), { delay: 50 });
    if (debug) console.log('Email typed');

    await page.waitForSelector(PASSWORD_SELECTOR, { timeout: 5000 });
    await page.type(PASSWORD_SELECTOR, String(password), { delay: 50 });
    if (debug) console.log('Password typed');

    // Click login
    await Promise.all([
      page.click(LOGIN_BUTTON_SELECTOR),
      page.waitForTimeout(2000),
    ]);

    // Check for error message
    const errorHandle = await page.$(LOGIN_ERROR_SELECTOR);
    if (errorHandle) {
      const txt = (await page.evaluate(el => el.innerText, errorHandle)).trim();
      if (txt && txt.toLowerCase().includes('invalid login')) {
        if (!keepBrowserOpen) await browser.close();
        return { success: false, message: 'Invalid login, please try again' };
      }
    }

    // Check if login succeeded
    const currentUrl = page.url();
    if (currentUrl !== LOGIN_URL && !currentUrl.includes('/login')) {
      if (debug) console.log('Login successful');
      if (keepBrowserOpen) return { success: true, page, browser };
      return { success: true };
    }

    // Edge case: still at login page without error
    if (!keepBrowserOpen) await browser.close();
    return { success: false, message: 'Unable to log in, please check your credentials' };

  } catch (err) {
    if (browser) {
      try { await browser.close(); } catch (e) { if (debug) console.error('Failed to close browser:', e); }
    }
    return { success: false, message: 'Validation failed: ' + err.message };
  }
}
