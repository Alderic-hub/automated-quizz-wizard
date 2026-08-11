document.addEventListener('DOMContentLoaded', () => {
  const scanBtn = document.getElementById('scan-btn');
  const submitBtn = document.getElementById('submit-btn');
  const statusDiv = document.getElementById('status-message');
  const questionsContainer = document.getElementById('questions-container');
  const quizUrlInput = document.getElementById('quiz-url');

  let currentResolutions = [];

  // Helper: Display UI status banner
  function showStatus(message, isError = false) {
    if (!statusDiv) return;
    statusDiv.textContent = message;
    statusDiv.style.display = 'block';
    statusDiv.style.backgroundColor = isError ? '#ffe6e6' : '#e6f7ff';
    statusDiv.style.color = isError ? '#d93025' : '#1a73e8';
    statusDiv.style.border = `1px solid ${isError ? '#f5c6cb' : '#b8daff'}`;
  }

  // Helper: Render Human-In-The-Loop Question Cards
  function renderQuestions(questions, resolutions) {
    questionsContainer.innerHTML = '';
    currentResolutions = resolutions;

    resolutions.forEach((res, index) => {
      const q = questions[index] || {};
      const card = document.createElement('div');
      card.className = 'question-card';
      card.style.cssText = 'border: 1px solid #ccc; padding: 16px; margin-bottom: 16px; border-radius: 8px; background: #fff;';

      const selectedValue = res.answerPayload?.selectedOptionValues?.[0] || '';
      const score = res.confidenceScore || 0;
      const reasoning = res.evidenceReasoning || 'No reasoning provided.';

      let optionsHtml = '';
      if (q.shuffledOptions && q.shuffledOptions.length > 0) {
        optionsHtml = q.shuffledOptions
          .map((opt) => {
            const isChecked = opt.value.toLowerCase() === selectedValue.toLowerCase();
            return `
              <label style="display: block; margin: 6px 0; cursor: pointer;">
                <input type="radio" name="q_slot_${res.slotNumber}" value="${opt.value}" ${isChecked ? 'checked' : ''} />
                ${opt.value}
              </label>
            `;
          })
          .join('');
      } else {
        optionsHtml = `
          <input type="text" id="q_input_${res.slotNumber}" value="${res.answerPayload?.textResponse || ''}" style="width: 100%; padding: 8px; margin-top: 6px;" />
        `;
      }

      card.innerHTML = `
        <div style="display: flex; justify-space-between; align-items: center; margin-bottom: 8px;">
          <h4 style="margin: 0;">Question Slot ${res.slotNumber} (${res.questionType})</h4>
          <span style="background: ${score > 80 ? '#d4edda' : '#fff3cd'}; color: ${score > 80 ? '#155724' : '#856404'}; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 0.85rem;">
            ${score}% Confidence
          </span>
        </div>
        <p style="font-weight: 500; margin-bottom: 12px;">${q.questionText || 'Question text unavailable'}</p>
        <div class="options-group" style="margin-bottom: 12px;">
          ${optionsHtml}
        </div>
        <div style="font-size: 0.85rem; color: #555; background: #f8f9fa; padding: 8px; border-radius: 4px;">
          <strong>AI Reasoning:</strong> ${reasoning}
        </div>
      `;

      questionsContainer.appendChild(card);
    });

    if (submitBtn) {
      submitBtn.style.display = 'inline-block';
    }
  }

  // Event 1: Trigger Quiz Scan and AI Resolution
  if (scanBtn) {
    scanBtn.addEventListener('click', async () => {
      const quizUrl = quizUrlInput ? quizUrlInput.value.trim() : '';
      if (!quizUrl) {
        showStatus('Please enter a valid Moodle Quiz URL.', true);
        return;
      }

      showStatus('Scanning quiz page and generating AI resolutions via Gemini... Please wait.');
      scanBtn.disabled = true;

      try {
        const response = await fetch('/api/quiz/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quizUrl })
        });

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.message || 'Scan failed');
        }

        showStatus(`Successfully extracted and resolved ${data.count} question(s). Review choices below.`);
        renderQuestions(data.questions, data.resolutions);
      } catch (err) {
        showStatus(`Error scanning quiz: ${err.message}`, true);
      } finally {
        scanBtn.disabled = false;
      }
    });
  }

  // Event 2: Submit Approved Answers back to Puppeteer
  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      // Gather any manual overrides selected by the user on the UI
      const overrides = currentResolutions.map((res) => {
        if (res.questionType === 'MULTIPLE_CHOICE' || res.questionType === 'TRUE_FALSE') {
          const checkedRadio = document.querySelector(`input[name="q_slot_${res.slotNumber}"]:checked`);
          if (checkedRadio) {
            return {
              slotNumber: res.slotNumber,
              answerPayload: { selectedOptionValues: [checkedRadio.value] }
            };
          }
        } else if (res.questionType === 'SHORT_ANSWER') {
          const textInput = document.getElementById(`q_input_${res.slotNumber}`);
          if (textInput) {
            return {
              slotNumber: res.slotNumber,
              answerPayload: { textResponse: textInput.value }
            };
          }
        }
        return res;
      });

      showStatus('Applying answers to active Moodle DOM elements...');
      submitBtn.disabled = true;

      try {
        const response = await fetch('/api/quiz/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            overrides,
            autoSubmit: false // Sets input choices on page; user can click finish on browser
          })
        });

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.message || 'Submission failed');
        }

        showStatus(data.message);
      } catch (err) {
        showStatus(`Error submitting answers: ${err.message}`, true);
      } finally {
        submitBtn.disabled = false;
      }
    });
  }
});
