
// services/tiktokService.js
const axios = require('axios');

class TikTokService {
  constructor() {
    this.baseURL = 'https://open-api.tiktok.com';
    this.clientKey = process.env.TIKTOK_CLIENT_KEY || 'sbawqqvtabe0moshpm';
    this.clientSecret = process.env.TIKTOK_CLIENT_SECRET || 'LVnJbfibR3kgfbLhyOSBQURAy09AIbxq';
    this.redirectUri = process.env.TIKTOK_REDIRECT_URI || 'https://youtube.com';
    this.scopes = [
      'user.b.basic',
      'video.publish',
      'video.upload',
      'user.info.profile',
      'user.info.stats'
    ];
  }

  // Генерируем URL для авторизации
  generateAuthUrl() {
    const state = this.generateRandomString(32);
    const params = new URLSearchParams({
      client_key: this.clientKey,
      scope: this.scopes.join(','),
      response_type: 'code',
      redirect_uri: this.redirectUri,
      state: state
    });

    return {
      authUrl: `${this.baseURL}/platform/oauth/connect/?${params.toString()}`,
      state: state
    };
  }

  // Обмениваем код на токены
  async exchangeCodeForTokens(code) {
    try {
      console.log('Exchanging code for tokens...');
      
      const response = await axios.post(`${this.baseURL}/oauth/access_token/`, {
        client_key: this.clientKey,
        client_secret: this.clientSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log('Token exchange response:', response.data);

      if (response.data.error) {
        throw new Error(`TikTok API Error: ${response.data.error} - ${response.data.error_description}`);
      }

      return response.data.data;
    } catch (error) {
      console.error('Token exchange error:', error.response?.data || error.message);
      throw new Error(`Failed to exchange code for tokens: ${error.response?.data?.error_description || error.message}`);
    }
  }

  // Получаем информацию о пользователе
  async getUserInfo(accessToken) {
    try {
      console.log('Getting user info...');
      
      const response = await axios.get(`${this.baseURL}/oauth/userinfo/`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      console.log('User info response:', response.data);

      if (response.data.error) {
        throw new Error(`TikTok API Error: ${response.data.error}`);
      }

      return response.data.data;
    } catch (error) {
      console.error('TikTok getUserInfo error:', error.response?.data || error.message);
      throw new Error(`Failed to get user info: ${error.response?.data?.error_description || error.message}`);
    }
  }

  // Получаем профиль пользователя
  async getUserProfile(accessToken) {
    try {
      console.log('Getting user profile...');
      
      const response = await axios.get(`${this.baseURL}/user/info/`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        params: {
          fields: 'open_id,union_id,avatar_url,display_name,bio_description,profile_deep_link,is_verified,follower_count,following_count,likes_count,video_count'
        }
      });

      console.log('User profile response:', response.data);

      if (response.data.error) {
        throw new Error(`TikTok API Error: ${response.data.error}`);
      }

      return response.data.data.user;
    } catch (error) {
      console.error('TikTok getUserProfile error:', error.response?.data || error.message);
      return null; // Profile is optional
    }
  }

  async uploadVideo(accessToken, videoPath, title, description = '', hashtags = '') {
    try {
      console.log('Starting video upload process...');
      
      // Step 1: Initialize upload
      const videoStats = require('fs').statSync(videoPath);
      console.log('Video file size:', videoStats.size);
      
      const initResponse = await axios.post(`${this.baseURL}/share/video/upload/`, {
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: videoStats.size,
          chunk_size: Math.min(videoStats.size, 10000000), // 10MB chunks or file size
          total_chunk_count: 1
        }
      }, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('Upload init response:', initResponse.data);

      if (initResponse.data.error) {
        throw new Error(`Upload init failed: ${initResponse.data.error}`);
      }

      const { upload_url, upload_id } = initResponse.data.data;

      // Step 2: Upload video file
      console.log('Uploading video file...');
      const videoBuffer = require('fs').readFileSync(videoPath);
      
      await axios.put(upload_url, videoBuffer, {
        headers: {
          'Content-Range': `bytes 0-${videoBuffer.length - 1}/${videoBuffer.length}`,
          'Content-Length': videoBuffer.length,
          'Content-Type': 'video/mp4'
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      });

      console.log('Video file uploaded successfully');

      // Step 3: Create post
      console.log('Creating TikTok post...');
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

      console.log('Post creation response:', postResponse.data);

      if (postResponse.data.error) {
        throw new Error(`Post creation failed: ${postResponse.data.error}`);
      }

      return postResponse.data.data;
    } catch (error) {
      console.error('TikTok upload error:', error.response?.data || error.message);
      throw error;
    }
  }

  async refreshAccessToken(refreshToken) {
    try {
      console.log('Refreshing access token...');
      
      const response = await axios.post(`${this.baseURL}/oauth/refresh_token/`, {
        client_key: this.clientKey,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log('Token refresh response:', response.data);

      if (response.data.error) {
        throw new Error(`Token refresh failed: ${response.data.error}`);
      }

      return response.data.data;
    } catch (error) {
      console.error('TikTok refresh token error:', error.response?.data || error.message);
      throw error;
    }
  }

  // Проверяем статус токена
  async validateToken(accessToken) {
    try {
      const userInfo = await this.getUserInfo(accessToken);
      return { valid: true, userInfo };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  // Утилита для генерации случайной строки
  generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}

module.exports = new TikTokService();