// services/tiktokService.js - Исправленная версия с TikTok OAuth v2
const axios = require('axios');

class TikTokService {
  constructor() {
    // Используем правильный v2 endpoint
    this.baseURL = 'https://open.tiktokapis.com/v2';
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
    
    // Cache для использованных кодов
    this.usedCodes = new Set();
  }

  // Generate OAuth URL
  generateAuthUrl(userId = null) {
    const state = this.generateRandomString(32);
    
    // Используем правильный v2 authorization endpoint
    const authUrl = `https://www.tiktok.com/v2/auth/authorize/` +
      `?client_key=${encodeURIComponent(this.clientKey)}` +
      `&scope=${encodeURIComponent(this.scopes.join(','))}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(this.redirectUri)}` +
      `&state=${encodeURIComponent(state)}`;

    console.log('🔗 Generated OAuth URL (v2):', authUrl);
    console.log('📋 Configuration:', {
      clientKey: this.clientKey,
      redirectUri: this.redirectUri,
      scopes: this.scopes.join(','),
      state: state.substring(0, 8) + '...'
    });

    return {
      authUrl,
      state,
      clientKey: this.clientKey,
      redirectUri: this.redirectUri,
      scopes: this.scopes.join(','),
      version: 'v2',
      warningMessage: '⚠️ Authorization code expires in 10 minutes and can only be used ONCE!',
      generatedAt: new Date().toISOString()
    };
  }

  // Exchange code for tokens - исправленная версия
  async exchangeCodeForTokens(code, state = null) {
    try {
      console.log('🔄 Starting OAuth v2 token exchange...');
      console.log('⏰ Current time:', new Date().toISOString());
      
      // Декодируем код (может быть URL-encoded)
      const decodedCode = decodeURIComponent(code.trim());
      console.log('📝 Code processing:', {
        original: code.substring(0, 10) + '...',
        decoded: decodedCode.substring(0, 10) + '...',
        length: decodedCode.length
      });

      // Проверяем, не использовался ли уже этот код
      if (this.usedCodes.has(decodedCode)) {
        throw new Error('Authorization code has already been used. Please get a new one.');
      }

      // Помечаем код как используемый
      this.usedCodes.add(decodedCode);

      const requestData = {
        client_key: this.clientKey,
        client_secret: this.clientSecret,
        code: decodedCode,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri
      };

      console.log('📡 Making v2 token exchange request...');
      console.log('🎯 Endpoint:', `${this.baseURL}/oauth/token/`);
      console.log('📋 Request data:', {
        ...requestData,
        client_secret: '[HIDDEN]',
        code: decodedCode.substring(0, 10) + '...'
      });

      // Используем правильный v2 endpoint
      const response = await axios.post(`${this.baseURL}/oauth/token/`, requestData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'TikTokContentManager/1.0'
        },
        timeout: 30000,
        // Преобразуем в URL-encoded формат
        transformRequest: [(data) => {
          return Object.keys(data)
            .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(data[key])}`)
            .join('&');
        }]
      });

      console.log('📥 Token exchange response status:', response.status);
      console.log('📥 Response data:', JSON.stringify(response.data, null, 2));

      // Проверяем успешность ответа
      if (response.data.error) {
        // v2 API возвращает ошибки в другом формате
        const errorCode = response.data.error;
        const description = response.data.error_description || 'Unknown error';
        
        let userMessage = description;
        switch (errorCode) {
          case 'invalid_grant':
            if (description.includes('expired')) {
              userMessage = '⏰ Authorization code has expired! Please start the OAuth process again and complete it within 10 minutes.';
            } else {
              userMessage = '❌ Invalid authorization code. Please make sure you copied the entire code correctly.';
            }
            break;
          case 'invalid_client':
            userMessage = '🔑 Invalid client credentials. Please check your TikTok app configuration.';
            break;
          case 'invalid_request':
            userMessage = '📝 Invalid request format. Please check the request parameters.';
            break;
        }
        
        throw new Error(`TikTok OAuth v2 Error (${errorCode}): ${userMessage}`);
      }

      // v2 API возвращает токены напрямую в data
      const tokenData = response.data;
      if (!tokenData || !tokenData.access_token) {
        throw new Error('No access token received from TikTok v2 API');
      }

      console.log('✅ v2 Token exchange successful');
      console.log('🎉 Token type:', tokenData.token_type || 'bearer');
      console.log('⏰ Expires in:', tokenData.expires_in, 'seconds');
      
      return tokenData;

    } catch (error) {
      console.error('❌ v2 Token exchange error:', error.message);
      
      // Удаляем код из используемых, если произошла ошибка
      if (code) {
        this.usedCodes.delete(decodeURIComponent(code.trim()));
      }
      
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      
      throw error;
    }
  }

  // Get user info - обновленный для v2
  async getUserInfo(accessToken, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        console.log(`🔍 Getting user info v2 (attempt ${i + 1}/${retries})...`);
        
        const response = await axios.post(`${this.baseURL}/user/info/`, {
          access_token: accessToken,
          fields: [
            'open_id',
            'union_id',
            'avatar_url',
            'display_name',
            'bio_description',
            'profile_deep_link',
            'is_verified',
            'follower_count',
            'following_count',
            'likes_count',
            'video_count'
          ]
        }, {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'TikTokContentManager/1.0'
          },
          timeout: 30000
        });

        console.log('📥 User info response:', JSON.stringify(response.data, null, 2));

        if (response.data.error) {
          throw new Error(`TikTok User Info Error: ${response.data.error.message || response.data.error}`);
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

  // Get user profile - обновленный для v2
  async getUserProfile(accessToken) {
    try {
      console.log('👤 Getting user profile v2...');
      
      const response = await axios.post(`${this.baseURL}/user/info/`, {
        access_token: accessToken,
        fields: [
          'open_id', 'union_id', 'avatar_url', 'display_name', 
          'bio_description', 'profile_deep_link', 'is_verified',
          'follower_count', 'following_count', 'likes_count', 'video_count'
        ]
      }, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'TikTokContentManager/1.0'
        },
        timeout: 30000
      });

      console.log('📥 Profile response:', JSON.stringify(response.data, null, 2));

      if (response.data.error) {
        throw new Error(`TikTok Profile Error: ${response.data.error.message || response.data.error}`);
      }

      return response.data.data || {};
    } catch (error) {
      console.error('❌ Profile fetch error:', error.message);
      throw error;
    }
  }

  // Validate token
  async validateToken(accessToken) {
    try {
      const userInfo = await this.getUserInfo(accessToken);
      return {
        valid: true,
        userInfo
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  // Generate random string
  generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Очистить кэш использованных кодов (периодически)
  clearUsedCodes() {
    const clearedCount = this.usedCodes.size;
    this.usedCodes.clear();
    console.log(`🧹 Cleared ${clearedCount} used codes from cache`);
    return clearedCount;
  }

  // Получить статистику
  getStats() {
    return {
      usedCodesCount: this.usedCodes.size,
      version: 'v2',
      baseURL: this.baseURL,
      clientKey: this.clientKey,
      redirectUri: this.redirectUri
    };
  }
}

module.exports = new TikTokService();