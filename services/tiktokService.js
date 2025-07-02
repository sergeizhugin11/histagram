// services/tiktokService.js - Enhanced version with better OAuth handling
const axios = require('axios');
const crypto = require('crypto');

class TikTokService {
  constructor() {
    this.baseURL = 'https://open-api.tiktok.com';
    this.clientKey = process.env.TIKTOK_CLIENT_KEY || 'sbawqqvtabe0moshpm';
    this.clientSecret = process.env.TIKTOK_CLIENT_SECRET || 'LVnJbfibR3kgfbLhyOSBQURAy09AIbxq';
    this.redirectUri = process.env.TIKTOK_REDIRECT_URI || 'https://login.salesforce.com';
    this.scopes = [
      'user.info.basic',
      'video.publish', 
      'video.upload',
      'user.info.profile',
      'user.info.stats'
    ];
    
    // Cache for temporary OAuth states
    this.oauthStates = new Map();
  }

  // Generate OAuth URL with state management
  generateAuthUrl(userId = null) {
    const state = this.generateRandomString(32);
    
    // Используем правильный endpoint TikTok
    const authUrl = `https://www.tiktok.com/v2/auth/authorize/` +
      `?client_key=${encodeURIComponent(this.clientKey)}` +
      `&scope=${encodeURIComponent(this.scopes.join(','))}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(this.redirectUri)}` +
      `&state=${encodeURIComponent(state)}`;

    console.log('Generated OAuth URL:', authUrl);
    console.log('Client Key:', this.clientKey);
    console.log('Scopes:', this.scopes.join(','));
    console.log('Redirect URI:', this.redirectUri);
    console.log('State:', state);

    return {
      authUrl,
      state,
      clientKey: this.clientKey,
      redirectUri: this.redirectUri,
      scopes: this.scopes.join(',')
    };
  }

  // Exchange code for tokens with enhanced error handling
  async exchangeCodeForTokens(code, state = null) {
    try {
      console.log('🔄 Starting token exchange process...');

      // Validate state if provided
      let codeVerifier = null;
      if (state) {
        const stateData = this.getOAuthState(state);
        codeVerifier = stateData.codeVerifier;
        console.log('✅ OAuth state validated');
      }

      const requestData = {
        client_key: this.clientKey,
        client_secret: this.clientSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri
      };

      // Add PKCE verifier if available
      if (codeVerifier) {
        requestData.code_verifier = codeVerifier;
      }

      console.log('📡 Making token exchange request...');
      console.log('Request data:', {
        ...requestData,
        client_secret: '[HIDDEN]',
        code: code.substring(0, 10) + '...'
      });

      // Try with POST JSON first
      let response;
      try {
        response = await axios.post(`${this.baseURL}/oauth/access_token/`, requestData, {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'TikTokContentManager/1.0'
          },
          timeout: 30000
        });
      } catch (jsonError) {
        console.log('📡 JSON request failed, trying form-encoded...');
        
        // Fallback to form-encoded
        const params = new URLSearchParams(requestData);
        response = await axios.post(`${this.baseURL}/oauth/access_token/`, params, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'TikTokContentManager/1.0'
          },
          timeout: 30000
        });
      }

      console.log('📥 Token exchange response status:', response.status);
      console.log('📥 Response data:', JSON.stringify(response.data, null, 2));

      // Check for error in response
      if (response.data.message === 'error' || response.data.error) {
        const errorCode = response.data.data?.error_code || response.data.error_code;
        const description = response.data.data?.description || response.data.error_description || 'Unknown error';
        
        // Provide specific error messages
        let userMessage = description;
        switch (errorCode) {
          case 10007:
            userMessage = 'Authorization code has expired. Please start the OAuth process again - you need to complete it within 10 minutes.';
            break;
          case 10003:
            userMessage = 'Invalid authorization code. Please make sure you copied the entire code correctly.';
            break;
          case 10004:
            userMessage = 'Invalid client credentials. Please check your TikTok app configuration.';
            break;
          case 10008:
            userMessage = 'Invalid redirect URI. Please check your TikTok app settings.';
            break;
        }
        
        throw new Error(`TikTok OAuth Error (${errorCode}): ${userMessage}`);
      }

      const tokenData = response.data.data;
      if (!tokenData || !tokenData.access_token) {
        throw new Error('No access token received from TikTok API');
      }

      // Clean up OAuth state
      if (state) {
        this.oauthStates.delete(state);
      }

      console.log('✅ Token exchange successful');
      return tokenData;

    } catch (error) {
      console.error('❌ Token exchange error:', error.message);
      
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      
      throw error;
    }
  }

  // Get user info with retry logic
  async getUserInfo(accessToken, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        console.log(`🔍 Getting user info (attempt ${i + 1}/${retries})...`);
        
        const response = await axios.get(`${this.baseURL}/oauth/userinfo/`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': 'TikTokContentManager/1.0'
          },
          timeout: 30000
        });

        console.log('📥 User info response:', JSON.stringify(response.data, null, 2));

        if (response.data.error || response.data.message === 'error') {
          throw new Error(`TikTok API Error: ${response.data.error || response.data.data?.description || 'Unknown error'}`);
        }

        return response.data.data;
      } catch (error) {
        console.error(`❌ User info attempt ${i + 1} failed:`, error.message);
        
        if (i === retries - 1) {
          throw new Error(`Failed to get user info after ${retries} attempts: ${error.message}`);
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }

  // Get user profile with optional fields
  async getUserProfile(accessToken, fields = null) {
    try {
      console.log('👤 Getting user profile...');
      
      const defaultFields = [
        'open_id', 'union_id', 'avatar_url', 'display_name', 
        'bio_description', 'profile_deep_link', 'is_verified',
        'follower_count', 'following_count', 'likes_count', 'video_count'
      ];
      
      const response = await axios.get(`${this.baseURL}/user/info/`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TikTokContentManager/1.0'
        },
        params: {
          fields: (fields || defaultFields).join(',')
        },
        timeout: 30000
      });

      console.log('📥 User profile response:', JSON.stringify(response.data, null, 2));

      if (response.data.error || response.data.message === 'error') {
        throw new Error(`Profile API Error: ${response.data.error || response.data.data?.description}`);
      }

      return response.data.data?.user || null;
    } catch (error) {
      console.error('❌ Failed to get user profile:', error.message);
      return null; // Profile is optional
    }
  }

  // Validate token with comprehensive checks
  async validateToken(accessToken) {
    try {
      // Try to get user info as validation
      const userInfo = await this.getUserInfo(accessToken, 1);
      
      // Check if token has necessary scopes
      const hasRequiredScopes = await this.checkTokenScopes(accessToken);
      
      return { 
        valid: true, 
        userInfo,
        hasRequiredScopes,
        scopes: hasRequiredScopes ? this.scopes : []
      };
    } catch (error) {
      return { 
        valid: false, 
        error: error.message,
        suggestion: error.message.includes('expired') 
          ? 'Please reconnect your TikTok account'
          : 'Please check your access token'
      };
    }
  }

  // Check if token has required scopes
  async checkTokenScopes(accessToken) {
    try {
      // Try a simple API call that requires video.upload scope
      const response = await axios.get(`${this.baseURL}/share/video/list/`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TikTokContentManager/1.0'
        },
        params: { limit: 1 },
        timeout: 10000
      });
      
      return response.status === 200;
    } catch (error) {
      console.log('⚠️  Token scope check failed:', error.message);
      return false;
    }
  }

  // Upload video with enhanced error handling and progress
  async uploadVideo(accessToken, videoPath, title, description = '', hashtags = '', onProgress = null) {
    try {
      console.log('🎬 Starting video upload process...');
      
      // Validate file
      const fs = require('fs');
      if (!fs.existsSync(videoPath)) {
        throw new Error('Video file not found');
      }
      
      const videoStats = fs.statSync(videoPath);
      const maxSize = 100 * 1024 * 1024; // 100MB
      
      if (videoStats.size > maxSize) {
        throw new Error(`Video file too large (${Math.round(videoStats.size / 1024 / 1024)}MB). Maximum size is 100MB.`);
      }
      
      console.log(`📊 Video size: ${Math.round(videoStats.size / 1024 / 1024)}MB`);
      
      if (onProgress) onProgress({ stage: 'initializing', progress: 10 });

      // Step 1: Initialize upload
      console.log('🔄 Initializing upload...');
      const chunkSize = Math.min(videoStats.size, 10000000); // 10MB max
      
      const initResponse = await axios.post(`${this.baseURL}/share/video/upload/`, {
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: videoStats.size,
          chunk_size: chunkSize,
          total_chunk_count: 1
        }
      }, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'TikTokContentManager/1.0'
        },
        timeout: 30000
      });

      console.log('📥 Upload init response:', JSON.stringify(initResponse.data, null, 2));

      if (initResponse.data.error || initResponse.data.message === 'error') {
        throw new Error(`Upload initialization failed: ${initResponse.data.data?.description || 'Unknown error'}`);
      }

      const { upload_url, upload_id } = initResponse.data.data;
      
      if (onProgress) onProgress({ stage: 'uploading', progress: 30 });

      // Step 2: Upload video file
      console.log('📤 Uploading video file...');
      const videoBuffer = fs.readFileSync(videoPath);
      
      await axios.put(upload_url, videoBuffer, {
        headers: {
          'Content-Range': `bytes 0-${videoBuffer.length - 1}/${videoBuffer.length}`,
          'Content-Length': videoBuffer.length,
          'Content-Type': 'video/mp4'
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 300000 // 5 minutes for upload
      });

      console.log('✅ Video file uploaded successfully');
      
      if (onProgress) onProgress({ stage: 'publishing', progress: 70 });

      // Step 3: Create post
      console.log('📝 Creating TikTok post...');
      const postData = {
        post_info: {
          title: title.substring(0, 150), // TikTok title limit
          description: `${description} ${hashtags}`.trim().substring(0, 2200), // TikTok description limit
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          video_cover_timestamp_ms: 1000
        },
        source_info: {
          source: 'FILE_UPLOAD',
          video_id: upload_id
        }
      };

      const postResponse = await axios.post(`${this.baseURL}/share/video/publish/`, postData, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'TikTokContentManager/1.0'
        },
        timeout: 60000
      });

      console.log('📥 Post creation response:', JSON.stringify(postResponse.data, null, 2));

      if (postResponse.data.error || postResponse.data.message === 'error') {
        throw new Error(`Post creation failed: ${postResponse.data.data?.description || 'Unknown error'}`);
      }

      if (onProgress) onProgress({ stage: 'completed', progress: 100 });

      console.log('🎉 Video published successfully to TikTok!');
      return postResponse.data.data;

    } catch (error) {
      console.error('❌ Video upload error:', error.message);
      
      if (onProgress) onProgress({ stage: 'error', progress: 0, error: error.message });
      
      // Provide helpful error messages
      if (error.message.includes('timeout')) {
        throw new Error('Upload timed out. Please try again with a smaller video file.');
      }
      
      if (error.response?.status === 413) {
        throw new Error('Video file too large for upload. Please compress your video.');
      }
      
      throw error;
    }
  }

  // Refresh access token
  async refreshAccessToken(refreshToken) {
    try {
      console.log('🔄 Refreshing access token...');
      
      const response = await axios.post(`${this.baseURL}/oauth/refresh_token/`, {
        client_key: this.clientKey,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      }, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'TikTokContentManager/1.0'
        },
        timeout: 30000
      });

      console.log('📥 Token refresh response:', JSON.stringify(response.data, null, 2));

      if (response.data.error || response.data.message === 'error') {
        throw new Error(`Token refresh failed: ${response.data.data?.description || 'Unknown error'}`);
      }

      console.log('✅ Token refreshed successfully');
      return response.data.data;
    } catch (error) {
      console.error('❌ Token refresh error:', error.message);
      throw error;
    }
  }

  // Get video analytics (if available)
  async getVideoAnalytics(accessToken, videoIds = [], fields = ['like_count', 'comment_count', 'share_count', 'view_count']) {
    try {
      if (videoIds.length === 0) return [];

      const response = await axios.get(`${this.baseURL}/video/data/`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'TikTokContentManager/1.0'
        },
        params: {
          video_ids: videoIds.join(','),
          fields: fields.join(',')
        },
        timeout: 30000
      });

      if (response.data.error || response.data.message === 'error') {
        throw new Error(`Analytics API Error: ${response.data.data?.description}`);
      }

      return response.data.data?.videos || [];
    } catch (error) {
      console.error('❌ Failed to get video analytics:', error.message);
      return [];
    }
  }

  // Utility method to generate random string
  generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Get OAuth status
  getOAuthStats() {
    this.cleanExpiredStates();
    return {
      activeStates: this.oauthStates.size,
      scopes: this.scopes,
      redirectUri: this.redirectUri,
      clientKey: this.clientKey
    };
  }
}

module.exports = new TikTokService();