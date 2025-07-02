// services/tiktokService.js - Добавить проверку времени и автоматический обмен
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
    
    // Кэш для кодов с временными метками
    this.pendingCodes = new Map();
  }

  // Генерация OAuth URL с отслеживанием времени
  generateAuthUrl(userId = null) {
    const state = this.generateRandomString(32);
    const timestamp = Date.now();
    
    // Сохраняем состояние с временной меткой
    this.pendingCodes.set(state, {
      userId,
      timestamp,
      expiresAt: timestamp + (10 * 60 * 1000) // 10 минут
    });
    
    const authUrl = `https://www.tiktok.com/v2/auth/authorize/` +
      `?client_key=${encodeURIComponent(this.clientKey)}` +
      `&scope=${encodeURIComponent(this.scopes.join(','))}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(this.redirectUri)}` +
      `&state=${encodeURIComponent(state)}`;

    console.log('🔗 OAuth URL generated at:', new Date(timestamp).toISOString());
    console.log('⏰ Code will expire at:', new Date(timestamp + 10 * 60 * 1000).toISOString());

    return {
      authUrl,
      state,
      clientKey: this.clientKey,
      redirectUri: this.redirectUri,
      scopes: this.scopes.join(','),
      expiresIn: 600, // 10 минут в секундах
      generatedAt: timestamp
    };
  }

  // Проверка валидности кода по времени
  isCodeValid(state) {
    const stateData = this.pendingCodes.get(state);
    if (!stateData) {
      return { valid: false, reason: 'State not found' };
    }

    const now = Date.now();
    const timeLeft = stateData.expiresAt - now;
    
    if (timeLeft <= 0) {
      this.pendingCodes.delete(state);
      return { 
        valid: false, 
        reason: 'Code expired',
        expiredAt: new Date(stateData.expiresAt).toISOString()
      };
    }

    return { 
      valid: true, 
      timeLeft: Math.floor(timeLeft / 1000), // секунды
      expiresAt: new Date(stateData.expiresAt).toISOString()
    };
  }

  // Улучшенный обмен кода на токены с проверкой времени
  async exchangeCodeForTokens(code, state = null) {
    try {
      console.log('🔄 Starting token exchange process...');
      console.log('⏰ Current time:', new Date().toISOString());

      // Проверяем валидность по времени
      if (state) {
        const validity = this.isCodeValid(state);
        if (!validity.valid) {
          throw new Error(`Code validation failed: ${validity.reason}. ${validity.expiredAt ? `Expired at: ${validity.expiredAt}` : ''}`);
        }
        console.log(`✅ Code is valid, expires in ${validity.timeLeft} seconds`);
      }

      const requestData = {
        client_key: this.clientKey,
        client_secret: this.clientSecret,
        code: code.trim(),
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri
      };

      console.log('📡 Making token exchange request...');
      console.log('Request data:', {
        ...requestData,
        client_secret: '[HIDDEN]',
        code: code.substring(0, 10) + '...'
      });

      let response;
      try {
        // Пробуем JSON формат
        response = await axios.post(`${this.baseURL}/oauth/access_token/`, requestData, {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'TikTokContentManager/1.0'
          },
          timeout: 30000
        });
      } catch (jsonError) {
        console.log('📡 JSON request failed, trying form-encoded...');
        
        // Fallback к form-encoded
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

      // Проверяем ошибки в ответе
      if (response.data.message === 'error' || response.data.error) {
        const errorCode = response.data.data?.error_code || response.data.error_code;
        const description = response.data.data?.description || response.data.error_description || 'Unknown error';
        
        let userMessage = description;
        switch (errorCode) {
          case 10007:
            userMessage = '⏰ Authorization code has expired (10 minutes limit). Please start the OAuth process again and complete it quickly.';
            break;
          case 10003:
            userMessage = '❌ Invalid authorization code. Please make sure you copied the entire code correctly.';
            break;
          case 10004:
            userMessage = '🔑 Invalid client credentials. Please check your TikTok app configuration.';
            break;
          case 10008:
            userMessage = '🔗 Invalid redirect URI. Please check your TikTok app settings.';
            break;
        }
        
        throw new Error(`TikTok OAuth Error (${errorCode}): ${userMessage}`);
      }

      const tokenData = response.data.data;
      if (!tokenData || !tokenData.access_token) {
        throw new Error('No access token received from TikTok API');
      }

      // Очищаем состояние OAuth
      if (state) {
        this.pendingCodes.delete(state);
      }

      console.log('✅ Token exchange successful');
      console.log('⏰ Completed at:', new Date().toISOString());
      
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

  // Очистка истекших состояний (можно вызывать периодически)
  cleanupExpiredStates() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [state, data] of this.pendingCodes.entries()) {
      if (data.expiresAt <= now) {
        this.pendingCodes.delete(state);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} expired OAuth states`);
    }
    
    return cleaned;
  }

  // Получить информацию о pending кодах
  getPendingCodesInfo() {
    const now = Date.now();
    const codes = [];
    
    for (const [state, data] of this.pendingCodes.entries()) {
      const timeLeft = data.expiresAt - now;
      codes.push({
        state: state.substring(0, 8) + '...',
        timeLeft: Math.max(0, Math.floor(timeLeft / 1000)),
        expired: timeLeft <= 0,
        generatedAt: new Date(data.timestamp).toISOString()
      });
    }
    
    return codes;
  }

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