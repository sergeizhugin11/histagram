const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const path = require('path');
const session = require('express-session');
require('dotenv').config();

const { sequelize } = require('./models');
const authRoutes = require('./routes/auth');
const accountRoutes = require('./routes/accounts');
const videoRoutes = require('./routes/videos');
const categoryRoutes = require('./routes/categories');
const scheduleRoutes = require('./routes/schedules');
const publishService = require('./services/publishService');

const app = express();

// Session middleware (for OAuth state management)
app.use(session({
  secret: process.env.SESSION_SECRET || 'your_session_secret_key_here',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 1000 // 1 hour
  }
}));

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'"]
    }
  }
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests from this IP, please try again later.' }
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files middleware
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/schedules', scheduleRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Serve main page for all non-API routes
app.get('*', (req, res) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Smart cron job for auto-publishing (every 10 minutes for more responsiveness)
cron.schedule('*/10 * * * *', async () => {
  console.log('🕒 Running smart publish job...');
  try {
    await publishService.publishPendingVideos();
  } catch (error) {
    console.error('❌ Auto-publish error:', error);
  }
});

// Cron job for token refresh (every hour)
cron.schedule('0 * * * *', async () => {
  console.log('🔄 Running token refresh job...');
  try {
    const { TikTokAccount } = require('./models');
    const tiktokService = require('./services/tiktokService');
    
    // Find accounts with tokens expiring in the next 2 hours
    const accounts = await TikTokAccount.findAll({
      where: {
        isActive: true,
        refreshToken: { [require('sequelize').Op.ne]: null },
        tokenExpiresAt: {
          [require('sequelize').Op.lte]: new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours from now
        }
      }
    });

    console.log(`Found ${accounts.length} accounts needing token refresh`);

    for (const account of accounts) {
      try {
        console.log(`Refreshing tokens for account ${account.accountName}`);
        const tokenData = await tiktokService.refreshAccessToken(account.refreshToken);
        
        await account.update({
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || account.refreshToken,
          tokenExpiresAt: tokenData.expires_in 
            ? new Date(Date.now() + tokenData.expires_in * 1000)
            : account.tokenExpiresAt,
          errorCount: 0,
          lastError: null
        });
        
        console.log(`✅ Tokens refreshed for account ${account.accountName}`);
      } catch (error) {
        console.error(`❌ Failed to refresh tokens for account ${account.accountName}:`, error);
        await account.incrementError(`Token refresh failed: ${error.message}`);
      }
    }
  } catch (error) {
    console.error('❌ Token refresh job error:', error);
  }
});

// Graceful error handling
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Express error:', err.stack);
  
  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large. Maximum size is 100MB.' });
  }
  
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Only video files are allowed.' });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Invalid token.' });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token expired.' });
  }

  // Validation errors
  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({ 
      error: 'Validation error',
      details: err.errors.map(e => e.message)
    });
  }

  // Database errors
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(400).json({ error: 'Duplicate entry found.' });
  }
  
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    console.log('🔌 Connecting to database...');
    await sequelize.authenticate();
    console.log('✅ Database connected successfully.');
    
    console.log('🔄 Synchronizing database...');
    await sequelize.sync();
    console.log('✅ Database synchronized.');
    
    // Create uploads directory if it doesn't exist
    const fs = require('fs');
    const uploadsDir = path.join(__dirname, 'uploads', 'videos');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
      console.log('📁 Created uploads directory.');
    }
    
    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 Open http://localhost:${PORT} to view the application`);
      console.log(`📊 API available at http://localhost:${PORT}/api`);
      console.log(`🔧 Health check: http://localhost:${PORT}/api/health`);
      
      // Display TikTok OAuth configuration
      console.log('\n📱 TikTok OAuth Configuration:');
      console.log(`   Client ID: ${process.env.TIKTOK_CLIENT_KEY}`);
      console.log(`   Redirect URI: ${process.env.TIKTOK_REDIRECT_URI}`);
      console.log(`   Scopes: user.info.basic,video.publish,video.upload,user.info.profile,user.info.stats`);
    });
  } catch (error) {
    console.error('❌ Unable to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  await sequelize.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  await sequelize.close();
  process.exit(0);
});

startServer();