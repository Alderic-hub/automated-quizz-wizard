const puppeteer = require('puppeteer');

/**
 * Extract all active questions and their available options from the current Moodle page.
 * @param {import('puppeteer').Page} page
 */
async function extractPageQuestions(page) {
  return await page.evaluate(() => {
    const questionNodes = document.querySelectorAll('.que');
    const extracted = [];

    questionNodes.forEach((qNode, index) => {
      // Determine Moodle Question Slot
      const slotMatch = qNode.className.match(/slot-(\d+)/);
      const slotNumber = slotMatch ? parseInt(slotMatch[1], 10) : index + 1;

      // Extract Question Text
      const qTextNode = qNode.querySelector('.qtext');
      const questionText = qTextNode ? qTextNode.innerText.trim() : '';

      // Determine Question Type
      let questionType = 'UNKNOWN';
      if (qNode.classList.contains('multichoice')) {
        const isMultiSelect = qNode.querySelectorAll('.answer input[type="checkbox"]').length > 0;
        questionType = isMultiSelect ? 'MULTIPLE_SELECT' : 'MULTIPLE_CHOICE';
      } else if (qNode.classList.contains('truefalse')) {
        questionType = 'TRUE_FALSE';
      } else if (qNode.classList.contains('shortanswer')) {
        questionType = 'SHORT_ANSWER';
      } else if (qNode.classList.contains('match')) {
        questionType = 'MATCHING';
      }

      // Extract Options & Form Metadata
      const options = [];
      const moodleMeta = {
        questionId: qNode.id,
        formInputs: []
      };

      if (questionType === 'MULTIPLE_CHOICE' || questionType === 'MULTIPLE_SELECT' || questionType === 'TRUE_FALSE') {
        const choiceRows = qNode.querySelectorAll('.answer > div, .answer li');
        choiceRows.forEach((row) => {
          const input = row.querySelector('input[type="radio"], input[type="checkbox"]');
          const label = row.querySelector('label, .flex-fill');

          if (input && label) {
            // Strip Moodle prefix numbers/letters (e.g. "a. ", "1. ")
            const optionValue = label.innerText.replace(/^[a-z0-9][\.\)\:]\s*/i, '').trim();
            options.push({
              key: input.id || input.name,
              value: optionValue
            });

            moodleMeta.formInputs.push({
              selector: `#${input.id}`,
              name: input.name,
              value: input.value,
              optionText: optionValue
            });
          }
        });
      } else if (questionType === 'SHORT_ANSWER') {
        const textInput = qNode.querySelector('input[type="text"]');
        if (textInput) {
          moodleMeta.formInputs.push({
            selector: `#${textInput.id}`,
            name: textInput.name
          });
        }
      }

      extracted.push({
        slotNumber,
        questionText,
        questionType,
        shuffledOptions: options,
        moodleMeta
      });
    });

    return extracted;
  });
}

/**
 * Apply resolved semantic answers back onto the active Moodle DOM page.
 * @param {import('puppeteer').Page} page
 * @param {Array} resolutions
 */
async function applyAnswersToPage(page, resolutions) {
  for (const item of resolutions) {
    const { questionType, answerPayload, moodleMeta } = item;

    if (!moodleMeta || !moodleMeta.formInputs) continue;

    if (questionType === 'MULTIPLE_CHOICE' || questionType === 'TRUE_FALSE') {
      const targetText = answerPayload.selectedOptionValues?.[0];
      if (!targetText) continue;

      const matchedInput = moodleMeta.formInputs.find(
        (i) => i.optionText.toLowerCase() === targetText.toLowerCase()
      );

      if (matchedInput) {
        await page.click(matchedInput.selector);
      }
    } else if (questionType === 'MULTIPLE_SELECT') {
      const targetTexts = (answerPayload.selectedOptionValues || []).map((v) => v.toLowerCase());

      for (const input of moodleMeta.formInputs) {
        const shouldBeChecked = targetTexts.includes(input.optionText.toLowerCase());
        const isChecked = await page.$eval(input.selector, (el) => el.checked);

        if (shouldBeChecked !== isChecked) {
          await page.click(input.selector);
        }
      }
    } else if (questionType === 'SHORT_ANSWER') {
      const responseText = answerPayload.textResponse || '';
      if (responseText && moodleMeta.formInputs[0]) {
        await page.type(moodleMeta.formInputs[0].selector, responseText, { delay: 30 });
      }
    }
  }
}

/**
 * Navigates to a Moodle quiz attempt, extracts questions, and returns them for AI resolution.
 */
async function scanQuizPage(browser, quizUrl) {
  const page = await browser.newPage();
  await page.goto(quizUrl, { waitUntil: 'networkidle2' });

  // Handle "Attempt quiz now" or "Continue the last attempt" buttons if present
  const startAttemptBtn = await page.$('input[value*="Attempt"], button:has-text("Attempt")');
  if (startAttemptBtn) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      startAttemptBtn.click()
    ]);
  }

  const questions = await extractPageQuestions(page);
  return { page, questions };
}

/**
 * Saves current page progress and clicks the "Next" or "Finish attempt" button.
 */
async function submitQuizPage(page) {
  const nextBtn = await page.$('input[name="next"], input[id="mod_quiz-next-nav"]');
  if (nextBtn) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      nextBtn.click()
    ]);
  }
}

module.exports = {
  extractPageQuestions,
  applyAnswersToPage,
  scanQuizPage,
  submitQuizPage
};
