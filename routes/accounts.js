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

// Add TikTok account
router.post('/', authMiddleware, [
  body('accountName').notEmpty().trim(),
  body('accessToken').notEmpty().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { accountName, accessToken, refreshToken } = req.body;

    // Verify token with TikTok API
    const userInfo = await tiktokService.getUserInfo(accessToken);
    
    if (!userInfo) {
      return res.status(400).json({ error: 'Invalid TikTok access token' });
    }

    const account = await TikTokAccount.create({
      userId: req.user.id,
      accountName,
      tiktokUserId: userInfo.user_id,
      accessToken,
      refreshToken: refreshToken || null,
      tokenExpiresAt: userInfo.expires_at ? new Date(userInfo.expires_at * 1000) : null
    });

    const accountResponse = account.toJSON();
    delete accountResponse.accessToken;
    delete accountResponse.refreshToken;

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
    const { accountName, isActive } = req.body;
    
    const account = await TikTokAccount.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    await account.update({
      accountName: accountName || account.accountName,
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