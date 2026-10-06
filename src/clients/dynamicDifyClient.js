const axios = require('axios');

const dynamicDifyClient = {
  /**
   * Sends audio evaluation request to a dynamically configured Dify workflow
   * @param {string} endpoint Custom Dify API url
   * @param {string} apiKey Custom Bearer token
   * @param {string} audioUrl Public link to the student's audio recording
   * @param {string} promptText The original passage the student was supposed to read
   */
  async evaluateSpeech(endpoint, apiKey, audioUrl, promptText, transcribeText = '', imageUrl = '', contextText = '', questionName = '') {
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
        transcribe: transcribeText,
        image_url: imageUrl,
        context: contextText,
        question: questionName,
        image: imageUrl ? {
          transfer_method: "remote_url",
          url: imageUrl,
          type: "image"
        } : undefined,
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
   * Dedicated speech transcription helper with dynamic input parameter key
   */
  async transcribeSpeech(endpoint, apiKey, audioUrl, fileParamKey = 'student_audio', promptText = '') {
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
        [fileParamKey]: {
          transfer_method: "remote_url",
          url: audioUrl,
          type: "audio"
        }
      },
      response_mode: "blocking",
      user: "admin"
    };

    try {
      console.log(`📤 Sending Dynamic Dify Speech Transcription [${fileParamKey}] request to: ${targetUrl}...`);
      const response = await axios.post(targetUrl, payload, { headers });
      return response.data;
    } catch (error) {
      console.error(`❌ Dynamic Dify transcribeSpeech [${fileParamKey}] failed:`, error.response?.data || error.message);
      throw error;
    }
  },

  /**
   * Sends writing evaluation request to a dynamically configured Dify workflow
   */
  async evaluateWriting(endpoint, apiKey, studentWriting, promptText, questionName, imageUrl = '', keyword = '') {
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
        question: promptText || questionName || '', // Mapped for Q6-7 "AI Score WSE Q6 7"
        student_writing: studentWriting || '',
        keyword: keyword || promptText || '',
        image: imageUrl ? {
          transfer_method: "remote_url",
          url: imageUrl,
          type: "image"
        } : undefined
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
