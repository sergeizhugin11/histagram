const axios = require('axios');

class TikTokService {
  constructor() {
    this.baseURL = 'https://open-api.tiktok.com';
    this.clientKey = process.env.TIKTOK_CLIENT_KEY;
    this.clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  }

  async getUserInfo(accessToken) {
    try {
      const response = await axios.get(`${this.baseURL}/oauth/userinfo/`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      return response.data.data;
    } catch (error) {
      console.error('TikTok getUserInfo error:', error.response?.data || error.message);
      return null;
    }
  }

  async uploadVideo(accessToken, videoPath, title, description = '', hashtags = '') {
    try {
      // Step 1: Get upload URL
      const initResponse = await axios.post(`${this.baseURL}/share/video/upload/`, {
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: require('fs').statSync(videoPath).size,
          chunk_size: 10000000,  // 10MB chunks
          total_chunk_count: 1
        }
      }, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const { upload_url, upload_id } = initResponse.data.data;

      // Step 2: Upload video file
      const videoBuffer = require('fs').readFileSync(videoPath);
      
      await axios.put(upload_url, videoBuffer, {
        headers: {
          'Content-Range': `bytes 0-${videoBuffer.length - 1}/${videoBuffer.length}`,
          'Content-Length': videoBuffer.length
        }
      });

      // Step 3: Create post
      const postResponse = await axios.post(`${this.baseURL}/share/video/publish/`, {
        post_info: {
          title: title,
          description: `${description} ${hashtags}`.trim(),
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          video_cover_timestamp_ms: 1000
        },
        source_info: {
          source: 'FILE_UPLOAD',
          video_id: upload_id
        }
      }, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      return postResponse.data.data;
    } catch (error) {
      console.error('TikTok upload error:', error.response?.data || error.message);
      throw error;
    }
  }

  async refreshAccessToken(refreshToken) {
    try {
      const response = await axios.post(`${this.baseURL}/oauth/refresh_token/`, {
        client_key: this.clientKey,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      });

      return response.data.data;
    } catch (error) {
      console.error('TikTok refresh token error:', error.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = new TikTokService();