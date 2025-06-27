const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { User } = require('../models');
const authMiddleware = require('../middleware/auth');
const { Op } = require('sequelize'); // ← ДОБАВИТЬ ЭТУ СТРОКУ

const router = express.Router();

// Login
router.post('/login', [
  body('email'),
  body('password').exists()
], async (req, res) => {
  try {
    console.log('Login attempt for:', req.body.email); // Для диагностики

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ where: { email } });
    if (!user) {
      console.log('User not found for email:', email);
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    console.log('User found:', {
      id: user.id,
      email: user.email,
      isActive: user.isActive,
      passwordLength: user.password ? user.password.length : 0,
      passwordStartsWith: user.password ? user.password.substring(0, 3) : 'none'
    });

    // Check if user is active
    if (!user.isActive) {
      console.log('User account is inactive');
      return res.status(400).json({ error: 'Account is deactivated' });
    }

    // Check password
    let isMatch = false;
    
    // Проверяем, хэширован ли пароль
    if (user.password && user.password.startsWith('$2')) {
      // Пароль хэширован
      console.log('Comparing hashed password');
      isMatch = await bcrypt.compare(password, user.password);
    } else {
      // Пароль не хэширован (добавлен вручную в БД)
      console.log('Warning: Password in DB is not hashed, comparing plaintext');
      isMatch = password === user.password;
      
      // Если пароль совпал, хэшируем его для будущего использования
      if (isMatch) {
        console.log('Password matched, hashing for future use');
        const hashedPassword = await bcrypt.hash(password, 12);
        await user.update({ password: hashedPassword });
      }
    }
    
    console.log('Password match result:', isMatch);

    if (!isMatch) {
      console.log('Password mismatch');
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('Login successful, token generated');

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get current user
router.get('/me', authMiddleware, async (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;