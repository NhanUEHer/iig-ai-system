const axios = require('axios');

const DIFY_API_URL = 'http://178.105.45.146:8080/v1';
const DIFY_API_KEY = 'app-PQjJkFe0WeOEKgkriBN0OtD0';

const difyClient = {
  /**
   * Sends audio evaluation request to Dify workflow
   * @param {string} audioUrl Public link to the student's audio recording
   * @param {string} promptText The original passage the student was supposed to read
   */
  async evaluateSpeech(audioUrl, promptText) {
    const url = `${DIFY_API_URL}/workflows/run`;
    
    const headers = {
      'Authorization': `Bearer ${DIFY_API_KEY}`,
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
      console.log(`📤 Sending Dify Speech Evaluation request to Workflow endpoint...`);
      const response = await axios.post(url, payload, { headers });
      return response.data;
    } catch (error) {
      console.error('❌ Dify evaluateSpeech failed:', error.response?.data || error.message);
      throw error;
    }
  }
};

module.exports = difyClient;
