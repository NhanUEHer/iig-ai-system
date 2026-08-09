const axios = require('axios');
require('dotenv').config();

const IIG_API_URL = process.env.IIG_API_URL || 'https://elearningapi.iigvietnam.com';
const API_KEY = process.env.IIG_API_KEY;

const iigClient = {
  /**
   * Logs in as admin and returns the token response
   */
  async loginAdmin() {
    if (!API_KEY || !process.env.IIG_USERNAME || !process.env.IIG_PASSWORD) {
      throw new Error('Missing IIG_API_KEY, IIG_USERNAME, or IIG_PASSWORD environment variable.');
    }
    const url = `${IIG_API_URL}/identity/api/Auth/login-admin`;
    const payload = {
      username: process.env.IIG_USERNAME,
      password: process.env.IIG_PASSWORD,
    };
    const headers = {
      'apikey': API_KEY,
      'category': 'admin',
      'content-type': 'application/json',
      'domain': 'iig',
    };

    try {
      const response = await axios.post(url, payload, { headers });
      return response.data; // Expected response: { token: '...' } or similar
    } catch (error) {
      console.error('❌ IIG Login Admin failed:', error.response?.data || error.message);
      throw error;
    }
  },

  /**
   * Fetches/searches the scoring queue or list
   */
  async searchScoringList(payload, token) {
    const url = `${IIG_API_URL}/api-admin-old/api/Scoring`;
    const headers = {
      'authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
      'category': 'admin',
      'content-type': 'application/json',
      'domain': 'iig',
    };

    try {
      const response = await axios.post(url, payload, { headers });
      return response.data;
    } catch (error) {
      console.error('❌ IIG Search Scoring List failed:', error.response?.data || error.message);
      throw error;
    }
  },

  /**
   * Fetches the overall structure of a test paper (contains sections & chooseIds)
   */
  async fetchCourseScoringDetail(courseScoringId, token) {
    const url = `${IIG_API_URL}/api-admin-old/api/Scoring/course-scoring/detail/questions?isEdit=false`;
    const headers = {
      'authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
      'category': 'admin',
      'content-type': 'application/json',
      'domain': 'iig',
    };
    const payload = [courseScoringId];

    try {
      const response = await axios.post(url, payload, { headers });
      return response.data; // Expected to return array
    } catch (error) {
      console.error(`❌ IIG Fetch Course Scoring Detail (${courseScoringId}) failed:`, error.response?.data || error.message);
      throw error;
    }
  },

  /**
   * Fetches detailed information for a single question response (contains recording file ID or writing answer)
   */
  async fetchQuestionDetails(chooseId, token) {
    const url = `${IIG_API_URL}/api-admin-old/api/Scoring/scoring/question/detail?chooseId=${chooseId}`;
    const headers = {
      'authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
      'category': 'admin',
      'domain': 'iig',
    };

    try {
      const response = await axios.get(url, { headers });
      return response.data;
    } catch (error) {
      console.error(`❌ IIG Fetch Question Details (${chooseId}) failed:`, error.response?.data || error.message);
      throw error;
    }
  },

  /**
   * Resolves a file ID into a temporary download/access URL
   */
  async getMigratedFileUrl(fileId, token) {
    const cleanToken = token.replace('Bearer ', '').trim();
    const url = `${IIG_API_URL}/api-admin-old/api/FileUploader/get-info-migrate-file/${fileId}?access_token=${cleanToken}`;
    
    try {
      const response = await axios.get(url);
      return response.data?.tempUrl || null;
    } catch (error) {
      console.error(`❌ IIG Get Migrated File URL (${fileId}) failed:`, error.response?.data || error.message);
      // Don't throw, just return null so the system continues without crashing
      return null;
    }
  }
};

module.exports = iigClient;
