// fetch_dashboard.js
import { parse } from 'date-fns';

/**
 * Step 1: Fetch user first name and subjects from the dashboard homepage.
 * @param {import('puppeteer').Page} page - logged-in Puppeteer page
 */
export async function fetchUserAndSubjects(page) {
  await page.waitForSelector('.logininfo a[title="View profile"]', { timeout: 10000 });

  const userFullName = await page.$eval(
    '.logininfo a[title="View profile"]',
    el => el.innerText.trim()
  );
  const firstName = userFullName.split(' ')[0];

  let subjects = await page.$$eval(
    'div.card-text.content.mt-3 ul.unlist li a',
    els => els.map(a => ({ name: a.innerText.trim(), link: a.href }))
  );

  // Filter out non-academic entries
  subjects = subjects.filter(subject => {
    const name = subject.name.toLowerCase();
    return !name.includes('reading contest') && !name.includes('clubs');
  });

  return { user: firstName, subjects };
}

/**
 * Step 2: Fetch unique quarters (Q1–Q4) for a given subject page.
 * @param {import('puppeteer').Page} page
 * @param {string} subjectLink
 */
export async function fetchQuarters(page, subjectLink) {
  await page.goto(subjectLink, { waitUntil: 'networkidle2' });

  const quarterSet = new Set();
  const quarters = [];

  const instancenameEls = await page.$$('.activityname');

  for (const el of instancenameEls) {
    const text = (await page.evaluate(e => e.innerText, el)).trim();
    const match = text.match(/\b(Q[1-4])\b/i);
    if (match) {
      const q = match[1].toUpperCase();
      if (!quarterSet.has(q)) {
        quarterSet.add(q);
        const linkHandle = await el.$('a');
        const link = linkHandle ? await page.evaluate(a => a.href, linkHandle) : null;
        quarters.push({ name: q, link });
      }
    }
  }

  return { quarters };
}

/**
 * Step 3: Fetch quizzes for a selected quarter that are open and not yet completed.
 *
 * A quiz is included when:
 *  - Its open date has passed (or has no date restriction)
 *  - The "Attempt quiz now" button is present (meaning it hasn't been submitted yet)
 *
 * @param {import('puppeteer').Page} page - currently on the subject page
 * @param {string} quarterName - e.g. "Q1"
 */
export async function fetchQuizzes(page, quarterName) {
  const instancenameEls = await page.$$('.activityname');
  const quizzes = [];
  const now = new Date();

  for (const el of instancenameEls) {
    const text = (await page.evaluate(e => e.innerText, el)).trim();

    // Only process activities matching the selected quarter
    const matchQuarter = text.match(/\b(Q[1-4])\b/i);
    if (!matchQuarter || matchQuarter[1].toUpperCase() !== quarterName) continue;

    // Get the quiz link
    const linkHandle = await el.$('a');
    if (!linkHandle) continue;
    const link = await page.evaluate(a => a.href, linkHandle);

    // Skip quizzes that haven't opened yet
    const openedText = await page.evaluate(el => {
      const datesEl = el.parentElement.querySelector('.activity-dates');
      return datesEl ? datesEl.innerText : '';
    }, el);

    if (openedText.includes('Opened:')) {
      const dateStr = openedText.replace('Opened:', '').trim();
      try {
        const openedDate = parse(dateStr, 'EEEE, d MMMM yyyy, h:mm a', new Date());
        if (openedDate > now) {
          console.log(`Skipping future quiz: ${text} (opens ${dateStr})`);
          continue;
        }
      } catch (e) {
        console.warn(`Could not parse open date for "${text}":`, e.message);
      }
    }

    // Open the quiz page in a new tab and check its state
    // BUG FIX: was using `page.$` (subject page) instead of `newPage.$` (quiz page)
    const browser = page.browser();
    const newPage = await browser.newPage();

    try {
      await newPage.goto(link, { waitUntil: 'networkidle2', timeout: 15000 });

      // "Attempt quiz now" button → quiz is available and not yet submitted
      const canAttempt = await newPage.$('.quizstartbuttondiv button, input[name="quizpassword"] ~ .singlebutton button, .btn[href*="attempt"]');

      // Fallback: look for the standard Moodle attempt button by text
      const attemptBtn = canAttempt ?? await newPage.evaluateHandle(() => {
        const btns = [...document.querySelectorAll('button, a.btn')];
        return btns.find(b => /attempt quiz/i.test(b.innerText)) ?? null;
      });
      const isAttemptable = attemptBtn && (await attemptBtn.asElement()) !== null;

      // Delayed/not-yet-open notification
      const notStarted = await newPage.$('.delayednotification');

      if (isAttemptable && !notStarted) {
        quizzes.push({ name: text, link });
      }
    } catch (err) {
      console.warn(`Could not check quiz "${text}":`, err.message);
    } finally {
      await newPage.close();
    }
  }

  return { quizzes };
}
