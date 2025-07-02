const express = require('express');
const { body, validationResult } = require('express-validator');
const { TikTokAccount } = require('../models');
const authMiddleware = require('../middleware/auth');
const tiktokService = require('../services/tiktokService');

const router = express.Router();

// Get all accounts
router.get('/', authMiddleware, async (req, res) => {
  try {
    const accounts = await TikTokAccount.findAll({
      where: { userId: req.user.id },
      attributes: { exclude: ['accessToken', 'refreshToken'] }
    });
    res.json(accounts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get TikTok OAuth URL
router.get('/oauth/url', authMiddleware, async (req, res) => {
  try {
    const { authUrl, state, clientKey, redirectUri, scopes } = tiktokService.generateAuthUrl();
    
    // Сохраняем state в сессии для проверки
    req.session = req.session || {};
    req.session.tiktokOAuthState = state;
    
    console.log('OAuth URL generated:', {
      authUrl,
      state,
      clientKey,
      redirectUri,
      scopes
    });
    
    res.json({
      authUrl,
      state,
      clientKey,
      redirectUri,
      scopes,
      instructions: [
        "1. Click the authorization URL to open TikTok",
        "2. Log in to your TikTok account",
        "3. Authorize the application",
        "4. You'll be redirected to YouTube",
        "5. Copy ONLY the 'code' parameter value from the URL",
        "6. Return here and paste the code to complete setup"
      ],
      debugInfo: {
        generatedAt: new Date().toISOString(),
        endpoint: 'https://www.tiktok.com/v2/auth/authorize/',
        method: 'GET'
      }
    });
  } catch (error) {
    console.error('OAuth URL generation error:', error);
    res.status(500).json({ 
      error: 'Failed to generate OAuth URL',
      details: error.message
    });
  }
});

// Exchange OAuth code for tokens and create account
router.post('/oauth/exchange', authMiddleware, [
  body('code').notEmpty().trim(),
  body('accountName').notEmpty().trim(),
  body('description').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { code, accountName, description } = req.body;

    console.log('🔄 Starting OAuth token exchange...');
    console.log('Code length:', code.length);
    console.log('Account name:', accountName);

    // Exchange code for tokens
    let tokenData;
    try {
      tokenData = await tiktokService.exchangeCodeForTokens(code);
    } catch (tokenError) {
      console.error('❌ Token exchange failed:', tokenError.message);
      return res.status(400).json({ 
        error: 'Failed to exchange authorization code for tokens',
        details: tokenError.message,
        suggestion: 'Please try getting a new authorization code.'
      });
    }
    
    if (!tokenData.access_token) {
      console.error('❌ No access token received');
      return res.status(400).json({ 
        error: 'Failed to obtain access token from TikTok',
        details: 'The token exchange was successful but no access token was returned'
      });
    }

    console.log('✅ Tokens obtained, getting user info...');

    // Get user information с правильной обработкой v2 API
    let userInfo;
    try {
      userInfo = await tiktokService.getUserInfo(tokenData.access_token);
      console.log('✅ User info obtained:', {
        open_id: userInfo.open_id,
        display_name: userInfo.display_name
      });
    } catch (userInfoError) {
      console.error('❌ Failed to get user info:', userInfoError.message);
      return res.status(400).json({ 
        error: 'Failed to get user information from TikTok',
        details: userInfoError.message,
        suggestion: 'The access token may be invalid or the account may not have the required permissions. Try the debug endpoint to test the token.',
        debug_endpoints: {
          test_token: 'POST /api/accounts/oauth/test-userinfo',
          debug_info: 'POST /api/accounts/oauth/debug-userinfo'
        }
      });
    }
    
    if (!userInfo || !userInfo.open_id) {
      console.error('❌ Invalid user info received:', userInfo);
      return res.status(400).json({ 
        error: 'Failed to get user information from TikTok',
        details: 'Invalid user data received from TikTok v2 API - missing open_id'
      });
    }

    // Get additional profile information (опционально, может не работать для всех токенов)
    let profileInfo = null;
    try {
      profileInfo = await tiktokService.getUserProfile(tokenData.access_token);
      console.log('✅ Profile info obtained');
    } catch (profileError) {
      console.log('⚠️ Profile info not available:', profileError.message);
      // Не останавливаем процесс, если профиль не доступен
    }

    console.log('👤 User info obtained:', {
      openId: userInfo.open_id,
      unionId: userInfo.union_id,
      displayName: userInfo.display_name || profileInfo?.display_name || accountName
    });

    // Check if account already exists
    const existingAccount = await TikTokAccount.findOne({
      where: { 
        tiktokUserId: userInfo.open_id,
        userId: req.user.id 
      }
    });

    if (existingAccount) {
      console.log('❌ Account already exists');
      return res.status(400).json({ 
        error: 'This TikTok account is already connected to your profile',
        accountName: existingAccount.accountName
      });
    }

    // Calculate token expiry time
    const tokenExpiresAt = tokenData.expires_in 
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null;

    console.log('💾 Creating account record...');

    // Create TikTok account record
    const account = await TikTokAccount.create({
      userId: req.user.id,
      accountName: accountName,
      description: description || '',
      tiktokUserId: userInfo.open_id,
      tiktokUnionId: userInfo.union_id || null,
      displayName: userInfo.display_name || profileInfo?.display_name || accountName,
      avatarUrl: userInfo.avatar_url || profileInfo?.avatar_url || null,
      isVerified: userInfo.is_verified || profileInfo?.is_verified || false,
      // Эти поля могут не быть доступны для всех приложений
      followerCount: profileInfo?.follower_count || 0,
      followingCount: profileInfo?.following_count || 0,
      likesCount: profileInfo?.likes_count || 0,
      videoCount: profileInfo?.video_count || 0,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || null,
      tokenExpiresAt: tokenExpiresAt,
      scope: tokenData.scope || tiktokService.scopes.join(','),
      lastSyncAt: new Date()
    });

    console.log('✅ Account created successfully:', account.id);

    // Return account without sensitive data
    const accountResponse = {
      id: account.id,
      accountName: account.accountName,
      description: account.description,
      tiktokUserId: account.tiktokUserId,
      displayName: account.displayName,
      avatarUrl: account.avatarUrl,
      isVerified: account.isVerified,
      followerCount: account.followerCount,
      followingCount: account.followingCount,
      likesCount: account.likesCount,
      videoCount: account.videoCount,
      isActive: account.isActive,
      tokenExpiresAt: account.tokenExpiresAt,
      createdAt: account.createdAt
    };

    res.status(201).json({
      message: 'TikTok account connected successfully! 🎉',
      account: accountResponse,
      debug: {
        tokenType: tokenData.token_type || 'bearer',
        expiresIn: tokenData.expires_in || 'unknown',
        scope: tokenData.scope || 'unknown',
        apiVersion: 'v2',
        userInfoSuccess: true,
        profileInfoSuccess: !!profileInfo
      }
    });

  } catch (error) {
    console.error('❌ OAuth exchange error:', error);
    res.status(500).json({ 
      error: 'Failed to connect TikTok account',
      details: error.message,
      suggestion: 'Please try again or contact support if the issue persists.'
    });
  }
});

// Add TikTok account manually (legacy method)
router.post('/manual', authMiddleware, [
  body('accountName').notEmpty().trim(),
  body('accessToken').notEmpty().trim(),
  body('description').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { accountName, accessToken, refreshToken, description } = req.body;

    // Verify token with TikTok API
    const validation = await tiktokService.validateToken(accessToken);
    
    if (!validation.valid) {
      return res.status(400).json({ error: 'Invalid TikTok access token: ' + validation.error });
    }

    const userInfo = validation.userInfo;
    
    // Get additional profile information
    let profileInfo = null;
    try {
      profileInfo = await tiktokService.getUserProfile(accessToken);
    } catch (profileError) {
      console.log('Profile info not available:', profileError.message);
    }

    // Check if account already exists
    const existingAccount = await TikTokAccount.findOne({
      where: { 
        tiktokUserId: userInfo.open_id,
        userId: req.user.id 
      }
    });

    if (existingAccount) {
      return res.status(400).json({ 
        error: 'This TikTok account is already connected' 
      });
    }

    const account = await TikTokAccount.create({
      userId: req.user.id,
      accountName,
      description: description || '',
      tiktokUserId: userInfo.open_id,
      tiktokUnionId: userInfo.union_id || null,
      displayName: profileInfo?.display_name || accountName,
      avatarUrl: profileInfo?.avatar_url || null,
      isVerified: profileInfo?.is_verified || false,
      followerCount: profileInfo?.follower_count || 0,
      followingCount: profileInfo?.following_count || 0,
      likesCount: profileInfo?.likes_count || 0,
      videoCount: profileInfo?.video_count || 0,
      accessToken,
      refreshToken: refreshToken || null,
      tokenExpiresAt: userInfo.expires_at ? new Date(userInfo.expires_at * 1000) : null
    });

    const accountResponse = {
      id: account.id,
      accountName: account.accountName,
      description: account.description,
      tiktokUserId: account.tiktokUserId,
      displayName: account.displayName,
      avatarUrl: account.avatarUrl,
      isVerified: account.isVerified,
      followerCount: account.followerCount,
      isActive: account.isActive,
      createdAt: account.createdAt
    };

    res.status(201).json({
      message: 'TikTok account added successfully',
      account: accountResponse
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update account
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { accountName, description, isActive } = req.body;
    
    const account = await TikTokAccount.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    await account.update({
      accountName: accountName || account.accountName,
      description: description !== undefined ? description : account.description,
      isActive: isActive !== undefined ? isActive : account.isActive
    });

    const accountResponse = account.toJSON();
    delete accountResponse.accessToken;
    delete accountResponse.refreshToken;

    res.json({
      message: 'Account updated successfully',
      account: accountResponse
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Refresh account tokens
router.post('/:id/refresh', authMiddleware, async (req, res) => {
  try {
    const account = await TikTokAccount.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    if (!account.refreshToken) {
      return res.status(400).json({ error: 'No refresh token available for this account' });
    }

    const tokenData = await tiktokService.refreshAccessToken(account.refreshToken);
    
    await account.update({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || account.refreshToken,
      tokenExpiresAt: tokenData.expires_in 
        ? new Date(Date.now() + tokenData.expires_in * 1000)
        : account.tokenExpiresAt
    });

    res.json({
      message: 'Tokens refreshed successfully',
      expiresAt: account.tokenExpiresAt
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh tokens' });
  }
});

// Test account connection
router.post('/:id/test', authMiddleware, async (req, res) => {
  try {
    const account = await TikTokAccount.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const validation = await tiktokService.validateToken(account.accessToken);
    
    if (validation.valid) {
      res.json({
        message: 'Account connection is working',
        userInfo: validation.userInfo
      });
    } else {
      res.status(400).json({
        message: 'Account connection failed',
        error: validation.error
      });
    }
  } catch (error) {
    console.error('Account test error:', error);
    res.status(500).json({ error: 'Failed to test account connection' });
  }
});

// Delete account
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const account = await TikTokAccount.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    await account.destroy();
    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/oauth/debug', authMiddleware, [
  body('code').notEmpty().trim()
], async (req, res) => {
  try {
    const { code } = req.body;
    
    console.log('\n🐛 ===== DEBUG OAUTH EXCHANGE =====');
    console.log('Received code:', code);
    console.log('Code length:', code.length);
    console.log('Environment variables:');
    console.log('- TIKTOK_CLIENT_KEY:', process.env.TIKTOK_CLIENT_KEY);
    console.log('- TIKTOK_CLIENT_SECRET exists:', !!process.env.TIKTOK_CLIENT_SECRET);
    console.log('- TIKTOK_REDIRECT_URI:', process.env.TIKTOK_REDIRECT_URI);
    
    // Manual token exchange with maximum debugging
    const axios = require('axios');
    
    const testData = {
      client_key: process.env.TIKTOK_CLIENT_KEY,
      client_secret: process.env.TIKTOK_CLIENT_SECRET,
      code: code.trim(),
      grant_type: 'authorization_code',
      redirect_uri: process.env.TIKTOK_REDIRECT_URI
    };

    console.log('Test request data:', {
      ...testData,
      client_secret: '***HIDDEN***'
    });

    // Test different endpoints manually
    const results = [];
    
    const endpoints = [
      'https://open-api.tiktok.com/v2/oauth/token/',
      'https://open-api.tiktok.com/oauth/access_token/',
      'https://open.tiktokapis.com/v2/oauth/token/'
    ];

    for (const endpoint of endpoints) {
      console.log(`\n🔄 Testing endpoint: ${endpoint}`);
      
      try {
        // Test JSON format
        const jsonResponse = await axios.post(endpoint, testData, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000,
          validateStatus: () => true
        });

        const jsonResult = {
          endpoint,
          format: 'JSON',
          status: jsonResponse.status,
          data: jsonResponse.data,
          success: !!(jsonResponse.data.access_token || jsonResponse.data.data?.access_token)
        };

        results.push(jsonResult);
        console.log('JSON result:', jsonResult);

        // Test form format
        const formResponse = await axios.post(endpoint, new URLSearchParams(testData).toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 30000,
          validateStatus: () => true
        });

        const formResult = {
          endpoint,
          format: 'FORM',
          status: formResponse.status,
          data: formResponse.data,
          success: !!(formResponse.data.access_token || formResponse.data.data?.access_token)
        };

        results.push(formResult);
        console.log('FORM result:', formResult);

      } catch (error) {
        const errorResult = {
          endpoint,
          error: error.message,
          responseData: error.response?.data || null,
          responseStatus: error.response?.status || null
        };
        
        results.push(errorResult);
        console.log('Error result:', errorResult);
      }
    }

    console.log('🐛 ===== DEBUG OAUTH EXCHANGE END =====\n');

    res.json({
      message: 'Debug token exchange completed',
      code_received: code,
      code_length: code.length,
      environment: {
        client_key: process.env.TIKTOK_CLIENT_KEY,
        client_secret_exists: !!process.env.TIKTOK_CLIENT_SECRET,
        redirect_uri: process.env.TIKTOK_REDIRECT_URI
      },
      test_results: results,
      suggestions: [
        'Check if the authorization code is still valid (codes typically expire quickly)',
        'Verify that the redirect_uri matches exactly with your TikTok app settings',
        'Ensure the client_key and client_secret are correct',
        'Try getting a fresh authorization code'
      ]
    });

  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({ 
      error: 'Debug failed',
      details: error.message 
    });
  }
});

module.exports = router;