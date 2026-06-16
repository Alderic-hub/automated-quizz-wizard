// fetch_dashboard_data.js
import { parse } from 'date-fns';

/**
 * Step 1: Fetch user first name and subjects
 * @param {puppeteer.Page} page
 */
export async function fetchUserAndSubjects(page) {
  // Get user first name
await page.waitForSelector('.logininfo a[title="View profile"]',  );
const userFullName = await page.$eval('.logininfo a[title="View profile"]', el => el.innerText.trim());
const firstName = userFullName.split(' ')[0];

  // Get subjects
let subjects = await page.$$eval('div.card-text.content.mt-3 ul.unlist li a', els =>
  els.map(a => ({
    name: a.innerText.trim(),
    link: a.href
  }))
);
  // Remove any subject containing "Reading Contest or Club" (case-insensitive)
  subjects = subjects.filter(subject => {
    const name = subject.name.toLowerCase();
    return !name.includes('reading contest') && !name.includes('clubs');
  });
  return { user: firstName, subjects };
}

/**
 * Step 2: Fetch unique quarters for a given subject
 * @param {puppeteer.Page} page
 * @param {string} subjectLink
 */
export async function fetchQuarters(page, subjectLink) {
  await page.goto(subjectLink, { waitUntil: 'networkidle2' });

  const quarterSet = new Set();
  const quarters = [];

  const instancenameEls = await page.$$('.activityname');

  for (let el of instancenameEls) {
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
 * Step 3: Fetch unfinished quizzes for a selected quarter
 * @param {puppeteer.Page} page
 * @param {string} quarterName e.g., "Q1"
 */
export async function fetchQuizzes(page, quarterName) {
  const instancenameEls = await page.$$('.activityname');
  const quizzes = [];
  const now = new Date();

  for (let el of instancenameEls) {
    const text = (await page.evaluate(e => e.innerText, el)).trim();
    const matchQuarter = text.match(/\b(Q[1-4])\b/i);
    if (!matchQuarter || matchQuarter[1].toUpperCase() !== quarterName) continue;

    // Get worksheet link
    const linkHandle = await el.$('a');
    if (!linkHandle) continue;
    const link = await page.evaluate(a => a.href, linkHandle);

    // Check Opened date
    const openedText = await page.evaluate(el => {
      const openedEl = el.parentElement.querySelector('.activity-dates');
      return openedEl ? openedEl.innerText : '';
    }, el);

    if (openedText.includes('Opened:')) {
      const dateStr = openedText.replace('Opened:', '').trim();
      try {
        const openedDate = parse(dateStr, 'EEEE, d MMMM yyyy, h:mm a', new Date());
        if (openedDate > now) continue; // skip future quizzes
      } catch (e) {
        console.log("error with checking the dates")
      }
    }

    // Reuse existing browser page to avoid new session
    const browser = page.browser();
    const newPage = await browser.newPage();
    await newPage.goto(link, { waitUntil: 'networkidle2' });

    const isDone = await page.$('.col ps-0 pe-2 mb-2');
    const notStarted = await page.$('.delayednotification');
    await newPage.close();

    if (!isDone || !notStarted ) quizzes.push({ name: text, link });
  }

  return { quizzes };
}
