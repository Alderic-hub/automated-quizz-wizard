const express = require('express');
const cors = require('cors');
const path = require('path');
const puppeteer = require('puppeteer');

const { scanQuizPage, applyAnswersToPage, submitQuizPage } = require('./run_quiz');
const { resolveQuizBatch } = require('./gemini');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend files from ../frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));

// Global in-memory state for local MVP session management
let activeBrowser = null;
let activePage = null;
let lastExtractedQuestions = [];
let lastResolutions = [];

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', browserActive: !!activeBrowser });
});

/**
 * Endpoint 1: Scan active Moodle Quiz page and generate AI resolution proposals
 */
app.post('/api/quiz/scan', async (req, res) => {
  const { quizUrl, moodleUrl, username, password } = req.body;

  try {
    // Launch Chromium browser instance if not already running
    if (!activeBrowser) {
      activeBrowser = await puppeteer.launch({
        headless: false, // Visible browser window for debugging
        defaultViewport: null,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized']
      });
    }

    // Reuse page or create a new tab
    const pages = await activeBrowser.pages();
    activePage = pages.length > 0 ? pages[0] : await activeBrowser.newPage();

    // Perform Moodle login if credentials are provided and user is not authenticated
    if (username && password && moodleUrl) {
      await activePage.goto(`${moodleUrl.replace(/\/$/, '')}/login/index.php`, { waitUntil: 'networkidle2' });
      
      const usernameInput = await activePage.$('#username');
      if (usernameInput) {
        await activePage.type('#username', username);
        await activePage.type('#password', password);
        await Promise.all([
          activePage.waitForNavigation({ waitUntil: 'networkidle2' }),
          activePage.click('#loginbtn')
        ]);
      }
    }

    // Navigate to Quiz and extract DOM questions
    const scanResult = await scanQuizPage(activeBrowser, quizUrl);
    activePage = scanResult.page;
    lastExtractedQuestions = scanResult.questions;

    if (lastExtractedQuestions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No quiz questions were found on the current page. Please ensure you are on an active quiz attempt page.'
      });
    }

    // Resolve extracted questions using Gemini AI Gateway
    console.log(`Resolving ${lastExtractedQuestions.length} extracted question(s) via Gemini...`);
    lastResolutions = await resolveQuizBatch(lastExtractedQuestions);

    res.json({
      success: true,
      count: lastResolutions.length,
      questions: lastExtractedQuestions,
      resolutions: lastResolutions
    });
  } catch (error) {
    console.error('Error during quiz scan:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred during quiz scanning'
    });
  }
});

/**
 * Endpoint 2: Apply approved answer resolutions back to Moodle page and optional submit
 */
app.post('/api/quiz/submit', async (req, res) => {
  const { overrides, autoSubmit = false } = req.body;

  if (!activePage) {
    return res.status(400).json({
      success: false,
      message: 'No active browser session found. Please run /api/quiz/scan first.'
    });
  }

  try {
    // Apply user manual overrides if provided from the review screen
    let finalResolutions = [...lastResolutions];
    if (overrides && Array.isArray(overrides)) {
      finalResolutions = finalResolutions.map((resItem) => {
        const overrideMatch = overrides.find((o) => o.slotNumber === resItem.slotNumber);
        if (overrideMatch) {
          return {
            ...resItem,
            answerPayload: overrideMatch.answerPayload
          };
        }
        return resItem;
      });
    }

    // Inject choices into active Moodle DOM elements
    console.log('Applying selected choices to Moodle form elements...');
    await applyAnswersToPage(activePage, finalResolutions);

    // Optionally click "Next page" or "Finish attempt"
    if (autoSubmit) {
      console.log('Submitting Moodle quiz page...');
      await submitQuizPage(activePage);
    }

    res.json({
      success: true,
      message: autoSubmit
        ? 'Answers applied and page submitted successfully.'
        : 'Answers filled into form. Review choices in browser before submitting.'
    });
  } catch (error) {
    console.error('Error during answer submission:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while submitting answers'
    });
  }
});

/**
 * Endpoint 3: Close active browser session
 */
app.post('/api/session/close', async (req, res) => {
  if (activeBrowser) {
    await activeBrowser.close();
    activeBrowser = null;
    activePage = null;
    lastExtractedQuestions = [];
    lastResolutions = [];
  }
  res.json({ success: true, message: 'Browser session terminated.' });
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(` AutoQuiz Local Server running at http://localhost:${PORT}`);
  console.log(` Open http://localhost:${PORT} in browser to launch UI`);
  console.log(`====================================================`);
});
