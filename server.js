const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const path = require('path');
require('dotenv').config();

const { sequelize } = require('./models');
const authRoutes = require('./routes/auth');
const accountRoutes = require('./routes/accounts');
const videoRoutes = require('./routes/videos');
const categoryRoutes = require('./routes/categories');
// const publishService = require('./services/publishService'); // Закомментировано до создания

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

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

// Serve main page for all non-API routes
app.get('*', (req, res) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Cron job for auto-publishing (every 30 minutes)
cron.schedule('*/30 * * * *', async () => {
  console.log('Running auto-publish job...');
  try {
    await publishService.publishPendingVideos();
  } catch (error) {
    console.error('Auto-publish error:', error);
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large. Maximum size is 100MB.' });
  }
  
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Only video files are allowed.' });
  }
  
  res.status(500).json({ error: 'Something went wrong!' });
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
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 Open http://localhost:${PORT} to view the application`);
      console.log(`📊 API available at http://localhost:${PORT}/api`);
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