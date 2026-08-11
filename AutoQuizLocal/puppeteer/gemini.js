const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini Client with API key from environment
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn('WARNING: GEMINI_API_KEY environment variable is not set.');
}

const genAI = new GoogleGenerativeAI(apiKey || 'DUMMY_KEY');

/**
 * Prompt Template Builder for Moodle Questions
 */
function buildQuestionPrompt(question) {
  const { questionType, questionText, shuffledOptions } = question;

  let optionsFormatted = '';
  if (shuffledOptions && shuffledOptions.length > 0) {
    optionsFormatted = `Available Choice Text Options:\n` + 
      shuffledOptions.map((opt) => `- "${opt.value}"`).join('\n');
  }

  return `
You are an expert academic tutor answering Moodle online quiz questions accurately.
CRITICAL REQUIREMENT: Return exact semantic text values matching the options listed below. DO NOT return option labels like "A", "Option 1", "choice 0", or index keys.

Question Type: ${questionType}
Question Prompt: "${questionText}"
${optionsFormatted}

Respond strictly in raw JSON without Markdown formatting using this structure:
{
  "confidenceScore": 95.0,
  "evidenceReasoning": "Detailed factual justification for the choice",
  "answerPayload": {
    "selectedOptionValues": ["Exact option text string matching one of the options above"],
    "textResponse": "Text for short answer if applicable"
  }
}
`.trim();
}

/**
 * Resolves a single extracted question using the Gemini 1.5 Pro model.
 * 
 * @param {Object} question - The question object extracted by run_quiz.js
 * @returns {Promise<Object>} Formatted resolution payload for applyAnswersToPage
 */
async function resolveQuestionWithGemini(question) {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is missing');
  }

  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-pro',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1
    }
  });

  const prompt = buildQuestionPrompt(question);

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const parsedData = JSON.parse(responseText);

    return {
      slotNumber: question.slotNumber,
      questionType: question.questionType,
      confidenceScore: parsedData.confidenceScore || 90.0,
      evidenceReasoning: parsedData.evidenceReasoning || 'Resolved via Gemini AI',
      answerPayload: parsedData.answerPayload || {},
      moodleMeta: question.moodleMeta
    };
  } catch (error) {
    console.error(`Failed to resolve question slot ${question.slotNumber} via Gemini:`, error.message);
    
    // Graceful fallback for failures
    return {
      slotNumber: question.slotNumber,
      questionType: question.questionType,
      confidenceScore: 0,
      evidenceReasoning: `AI Resolution Error: ${error.message}`,
      answerPayload: {},
      moodleMeta: question.moodleMeta
    };
  }
}

/**
 * Resolves a batch of extracted quiz questions in parallel.
 * 
 * @param {Array<Object>} questions - Array of questions from extractPageQuestions
 * @returns {Promise<Array<Object>>} Array of answer resolution objects
 */
async function resolveQuizBatch(questions) {
  const resolutionPromises = questions.map((q) => resolveQuestionWithGemini(q));
  return await Promise.all(resolutionPromises);
}

module.exports = {
  buildQuestionPrompt,
  resolveQuestionWithGemini,
  resolveQuizBatch
};
