// server.js
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { validateCredentials } from './validate_user.js';
import { fetchUserAndSubjects, fetchQuarters, fetchQuizzes } from './fetch_dashboard.js';

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = 3000;

// Store the logged-in page for session reuse
let loggedInPage = null;
let loggedInBrowser = null;
let keepAliveInterval = null;

/** 🧩 Keep page alive to prevent idle timeout */
function startKeepAlive(page) {
  keepAliveInterval = setInterval(async () => {
    try {
      await page.evaluate(() => document.title); // minimal DOM access
    } catch (err) {
      console.warn('Page keep-alive failed:', err.message);
    }
  }, 30_000); // every 30 seconds
}

/** 🧩 Stop keep-alive */
function stopKeepAlive() {
  if (keepAliveInterval) clearInterval(keepAliveInterval);
  keepAliveInterval = null;
}

// ----------------- Routes -----------------

// Validate user credentials and start session
app.post('/validate', async (req, res) => {
  const { email, password, headless } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required' });
  }

  try {
    const result = await validateCredentials(email, password, {
      headless: false,
      keepBrowserOpen: true,
      debug: true
    });

    if (result.success) {
      // Close previous session if exists
      if (loggedInBrowser) {
        stopKeepAlive();
        await loggedInBrowser.close();
      }

      loggedInPage = result.page;
      loggedInBrowser = result.browser;

      // Start keep-alive to prevent idle timeout
      startKeepAlive(loggedInPage);

      return res.json({ success: true, message: 'Login successful' });
    } else {
      return res.status(401).json({ success: false, message: result.message || 'Invalid credentials' });
    }
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// Middleware to ensure active page
async function getActivePage(req, res, next) {
  if (!loggedInPage) return res.status(401).json({ success: false, message: 'User not logged in' });

  try {
    // Test if page is alive
    await loggedInPage.title();
  } catch (err) {
    console.log('Page was stale, reloading...');
    await loggedInPage.reload({ waitUntil: 'networkidle2' });
  }

  req.page = loggedInPage;
  next();
}

// Fetch subjects & user name
app.get('/fetch-dashboard/subjects', getActivePage, async (req, res) => {
  try {
    const data = await fetchUserAndSubjects(req.page);
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch subjects: ' + err.message });
  }
});

// Fetch quarters for a subject
app.post('/fetch-dashboard/quarters', getActivePage, async (req, res) => {
  const { subjectLink } = req.body;
  if (!subjectLink) return res.status(400).json({ success: false, message: 'subjectLink required' });

  try {
    const data = await fetchQuarters(req.page, subjectLink);
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch quarters: ' + err.message });
  }
});

// Fetch quizzes for a quarter
app.post('/fetch-dashboard/quizzes', getActivePage, async (req, res) => {
  const { quarterName } = req.body;
  if (!quarterName) return res.status(400).json({ success: false, message: 'quarterName required' });

  try {
    const data = await fetchQuizzes(req.page, quarterName);
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch quizzes: ' + err.message });
  }
});

// Logout
app.post('/logout', async (req, res) => {
  try {
    stopKeepAlive();
    if (loggedInBrowser) await loggedInBrowser.close();
    loggedInBrowser = null;
    loggedInPage = null;
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Logout failed: ' + err.message });
  }
});

// Close browser on server shutdown
process.on('SIGINT', async () => {
  stopKeepAlive();
  if (loggedInBrowser) {
    await loggedInBrowser.close();
    console.log('Browser closed on server shutdown');
  }
  process.exit();
});

app.listen(PORT, () => console.log(` Server running at http://localhost:${PORT}`));
