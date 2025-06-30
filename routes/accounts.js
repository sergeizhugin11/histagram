// routes/accounts.js
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
    const { authUrl, state } = tiktokService.generateAuthUrl();

    // Сохраняем state в сессии или временно в БД для проверки
    req.session = req.session || {};
    req.session.tiktokOAuthState = state;

    res.json({
      authUrl,
      state,
      instructions: [
        "1. Click the authorization URL to open TikTok",
        "2. Log in to your TikTok account",
        "3. Authorize the application",
        "4. Copy the 'code' parameter from the redirect URL",
        "5. Return here and paste the code to complete setup"
      ]
    });
  } catch (error) {
    console.error('OAuth URL generation error:', error);
    res.status(500).json({ error: 'Failed to generate OAuth URL' });
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

    console.log('Starting OAuth token exchange...');

    // Exchange code for tokens
    const tokenData = await tiktokService.exchangeCodeForTokens(code);
    
    if (!tokenData.access_token) {
      return res.status(400).json({ error: 'Failed to obtain access token from TikTok' });
    }

    console.log('Tokens obtained, getting user info...');

    // Get user information
    const userInfo = await tiktokService.getUserInfo(tokenData.access_token);
    
    if (!userInfo || !userInfo.open_id) {
      return res.status(400).json({ error: 'Failed to get user information from TikTok' });
    }

    // Get additional profile information (optional)
    let profileInfo = null;
    try {
      profileInfo = await tiktokService.getUserProfile(tokenData.access_token);
    } catch (profileError) {
      console.log('Profile info not available:', profileError.message);
    }

    console.log('User info obtained:', {
      openId: userInfo.open_id,
      unionId: userInfo.union_id,
      displayName: profileInfo?.display_name
    });

    // Check if account already exists
    const existingAccount = await TikTokAccount.findOne({
      where: { 
        tiktokUserId: userInfo.open_id,
        userId: req.user.id 
      }
    });

    if (existingAccount) {
      return res.status(400).json({ 
        error: 'This TikTok account is already connected to your profile' 
      });
    }

    // Calculate token expiry time
    const tokenExpiresAt = tokenData.expires_in 
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null;

    // Create TikTok account record
    const account = await TikTokAccount.create({
      userId: req.user.id,
      accountName: accountName,
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
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || null,
      tokenExpiresAt: tokenExpiresAt,
      scope: tokenData.scope || tiktokService.scopes.join(',')
    });

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
      message: 'TikTok account connected successfully',
      account: accountResponse
    });

  } catch (error) {
    console.error('OAuth exchange error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to connect TikTok account' 
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

module.exports = router;