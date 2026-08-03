// server.js
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateCredentials } from './validate_user.js';
import { fetchUserAndSubjects, fetchQuarters, fetchQuizzes } from './fetch_dashboard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend')));

const PORT = 5000;

// Store the logged-in page for session reuse
let loggedInPage = null;
let loggedInBrowser = null;
let keepAliveInterval = null;

// SSE clients for progress updates
let sseClients = [];

/** Push a progress update to all connected SSE clients */
export function sendProgress(message, percent = null) {
  const payload = JSON.stringify({ message, percent });
  sseClients.forEach(res => res.write(`data: ${payload}\n\n`));
}

/** Keep page alive to prevent idle timeout */
function startKeepAlive(page) {
  keepAliveInterval = setInterval(async () => {
    try {
      await page.evaluate(() => document.title);
    } catch (err) {
      console.warn('Page keep-alive failed:', err.message);
    }
  }, 30_000);
}

/** Stop keep-alive */
function stopKeepAlive() {
  if (keepAliveInterval) clearInterval(keepAliveInterval);
  keepAliveInterval = null;
}

// ----------------- Routes -----------------

// SSE progress stream
app.get('/progress', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.push(res);

  req.on('close', () => {
    sseClients = sseClients.filter(client => client !== res);
  });
});

// Validate user credentials and start session
app.post('/validate', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required' });
  }

  try {
    sendProgress('Launching browser...', 10);
    const result = await validateCredentials(email, password, {
      headless: true,
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

      startKeepAlive(loggedInPage);
      sendProgress('Login successful', 100);

      return res.json({ success: true, message: 'Login successful' });
    } else {
      sendProgress('Login failed', 0);
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

// Serve frontend pages directly
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, '../frontend/dashboard.html')));

// Close browser on server shutdown
process.on('SIGINT', async () => {
  stopKeepAlive();
  if (loggedInBrowser) {
    await loggedInBrowser.close();
    console.log('Browser closed on server shutdown');
  }
  process.exit();
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
