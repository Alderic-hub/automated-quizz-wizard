// gemini.js — Gemini AI integration for AutoQuiz
// Handles prompting and answer parsing for all three question types.

import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

/**
 * Ask Gemini to answer a multiple-choice question.
 *
 * @param {string} questionText  - The question as it appears on the page
 * @param {string[]} options     - Array of answer option texts, e.g. ["Paris", "London", "Berlin"]
 * @param {string} subject       - Subject name for context, e.g. "English"
 * @returns {Promise<{ index: number, text: string, raw: string }>}
 *   index = 0-based index of the chosen option
 *   text  = the chosen option text
 *   raw   = Gemini's full response (for debugging)
 */
export async function answerMultipleChoice(questionText, options, subject = '') {
  const optionLines = options.map((o, i) => `${i + 1}. ${o}`).join('\n');

  const prompt = `You are answering a school quiz question${subject ? ` for the subject: ${subject}` : ''}.

Question:
${questionText}

Answer options:
${optionLines}

Instructions:
- Reply with ONLY the number of the correct answer (e.g. "2").
- Do not explain, do not add punctuation, just the number.`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim();

  // Parse the number out of the response
  const match = raw.match(/\d+/);
  if (!match) throw new Error(`Gemini returned unexpected response for MC: "${raw}"`);

  const index = parseInt(match[0], 10) - 1; // convert to 0-based
  if (index < 0 || index >= options.length) {
    throw new Error(`Gemini chose option ${index + 1} but only ${options.length} options exist`);
  }

  return { index, text: options[index], raw };
}

/**
 * Ask Gemini to answer a matching question.
 *
 * @param {string} questionText        - The overall matching question prompt
 * @param {{ left: string, options: string[] }[]} pairs
 *   Each item has a left-side term and the dropdown options for it
 * @param {string} subject
 * @returns {Promise<{ answers: string[], raw: string }>}
 *   answers[i] = the chosen option text for pairs[i]
 */
export async function answerMatching(questionText, pairs, subject = '') {
  const pairLines = pairs
    .map((p, i) => `${i + 1}. "${p.left}" → options: ${p.options.map((o, j) => `(${j + 1}) ${o}`).join(', ')}`)
    .join('\n');

  const prompt = `You are answering a school matching quiz question${subject ? ` for the subject: ${subject}` : ''}.

${questionText ? `Instructions: ${questionText}\n` : ''}
Match each item on the left to the correct option:
${pairLines}

Reply with ONLY a comma-separated list of option numbers in order, one per left-side item.
Example for 3 items: "2,1,3"
No spaces, no punctuation, just the numbers.`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim();

  const numbers = raw.split(',').map(s => parseInt(s.trim(), 10) - 1);
  if (numbers.length !== pairs.length) {
    throw new Error(`Gemini returned ${numbers.length} answers but expected ${pairs.length}`);
  }

  const answers = numbers.map((idx, i) => {
    if (idx < 0 || idx >= pairs[i].options.length) {
      throw new Error(`Gemini chose option ${idx + 1} for item ${i + 1} but only ${pairs[i].options.length} options exist`);
    }
    return pairs[i].options[idx];
  });

  return { answers, raw };
}

/**
 * Ask Gemini to answer a fill-in-the-blank question.
 *
 * @param {string} questionText  - The question/sentence with the blank
 * @param {string} subject
 * @returns {Promise<{ answer: string, raw: string }>}
 */
export async function answerFillBlank(questionText, subject = '') {
  const prompt = `You are answering a school fill-in-the-blank quiz question${subject ? ` for the subject: ${subject}` : ''}.

Question:
${questionText}

Instructions:
- Reply with ONLY the word or short phrase that fills the blank.
- Be as concise as possible — single word or short phrase only.
- Do not include the full sentence, do not explain, no punctuation at the end.`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim();

  // Strip trailing punctuation just in case
  const answer = raw.replace(/[.!?,;]+$/, '').trim();

  return { answer, raw };
}
