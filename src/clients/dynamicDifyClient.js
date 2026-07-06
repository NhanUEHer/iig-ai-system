const axios = require('axios');

const dynamicDifyClient = {
  /**
   * Sends audio evaluation request to a dynamically configured Dify workflow
   * @param {string} endpoint Custom Dify API url
   * @param {string} apiKey Custom Bearer token
   * @param {string} audioUrl Public link to the student's audio recording
   * @param {string} promptText The original passage the student was supposed to read
   */
  async evaluateSpeech(endpoint, apiKey, audioUrl, promptText) {
    // Standardize URL: Dify workflows endpoint is typically /workflows/run
    const targetUrl = endpoint.endsWith('/workflows/run') 
      ? endpoint 
      : `${endpoint.replace(/\/$/, '')}/workflows/run`;

    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };

    const payload = {
      inputs: {
        text_passage: promptText,
        student_audio: {
          transfer_method: "remote_url",
          url: audioUrl,
          type: "audio"
        }
      },
      response_mode: "blocking",
      user: "admin"
    };

    try {
      console.log(`📤 Sending Dynamic Dify Speech Evaluation request to: ${targetUrl}...`);
      const response = await axios.post(targetUrl, payload, { headers });
      return response.data;
    } catch (error) {
      console.error('❌ Dynamic Dify evaluateSpeech failed:', error.response?.data || error.message);
      throw error;
    }
  },

  /**
   * Sends writing evaluation request to a dynamically configured Dify workflow
   */
  async evaluateWriting(endpoint, apiKey, studentWriting, promptText, questionName) {
    const targetUrl = endpoint.endsWith('/workflows/run') 
      ? endpoint 
      : `${endpoint.replace(/\/$/, '')}/workflows/run`;

    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };

    const payload = {
      inputs: {
        question_name: questionName || '',
        prompt_text: promptText || '',
        student_writing: studentWriting || ''
      },
      response_mode: "blocking",
      user: "admin"
    };

    try {
      console.log(`📤 Sending Dynamic Dify Writing Evaluation request to: ${targetUrl}...`);
      const response = await axios.post(targetUrl, payload, { headers });
      return response.data;
    } catch (error) {
      console.error('❌ Dynamic Dify evaluateWriting failed:', error.response?.data || error.message);
      throw error;
    }
  }
};

module.exports = dynamicDifyClient;
