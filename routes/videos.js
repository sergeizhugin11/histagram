// routes/videos.js - Улучшенный fileFilter для поддержки всех видео форматов

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { body, validationResult } = require('express-validator');
const { Video, Category, PublishLog } = require('../models');
const authMiddleware = require('../middleware/auth');
const videoService = require('../services/videoService');

const router = express.Router();

// Multer configuration with improved video file detection
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = path.join(process.env.UPLOAD_PATH || './uploads', 'videos');
    await fs.mkdir(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // Увеличили до 200MB
  fileFilter: (req, file, cb) => {
    console.log('📁 File upload attempt:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });

    // Поддерживаемые расширения видео файлов
    const allowedExtensions = [
      '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv', 
      '.m4v', '.3gp', '.3g2', '.mts', '.m2ts', '.ts', '.vob',
      '.ogv', '.dv', '.f4v', '.asf', '.rm', '.rmvb', '.divx'
    ];

    // Поддерживаемые MIME типы
    const allowedMimeTypes = [
      'video/mp4',
      'video/avi',
      'video/quicktime',        // .mov files
      'video/x-msvideo',        // .avi files
      'video/x-ms-wmv',         // .wmv files
      'video/x-flv',            // .flv files
      'video/webm',             // .webm files
      'video/x-matroska',       // .mkv files
      'video/3gpp',             // .3gp files
      'video/3gpp2',            // .3g2 files
      'video/mp2t',             // .ts files
      'video/ogg',              // .ogv files
      'video/x-f4v',            // .f4v files
      'video/x-ms-asf',         // .asf files
      'application/octet-stream' // Fallback для неопознанных типов
    ];

    const fileExtension = path.extname(file.originalname).toLowerCase();
    const mimeType = file.mimetype.toLowerCase();

    // Проверяем расширение файла
    const hasValidExtension = allowedExtensions.includes(fileExtension);
    
    // Проверяем MIME тип
    const hasValidMimeType = allowedMimeTypes.includes(mimeType);

    // Специальная проверка для .mov файлов
    const isMOVFile = fileExtension === '.mov' && (
      mimeType === 'video/quicktime' || 
      mimeType === 'video/mp4' ||
      mimeType === 'application/octet-stream'
    );

    // Принимаем файл если:
    // 1. И расширение, и MIME тип валидны
    // 2. Или это .mov файл с любым из допустимых MIME типов
    // 3. Или расширение валидно (даже если MIME тип не определен)
    if (hasValidExtension && (hasValidMimeType || isMOVFile)) {
      console.log('✅ File accepted:', {
        extension: fileExtension,
        mimetype: mimeType,
        reason: hasValidMimeType ? 'valid mime type' : 'valid extension'
      });
      return cb(null, true);
    } else {
      console.log('❌ File rejected:', {
        extension: fileExtension,
        mimetype: mimeType,
        hasValidExtension,
        hasValidMimeType,
        isMOVFile
      });
      
      const error = new Error(
        `File type not supported. Received: ${fileExtension} (${mimeType}). ` +
        `Supported formats: ${allowedExtensions.join(', ')}`
      );
      error.code = 'INVALID_FILE_TYPE';
      cb(error);
    }
  }
});

// Middleware для обработки ошибок загрузки
const handleUploadErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        error: 'File too large',
        details: 'Maximum file size is 200MB',
        maxSize: '200MB'
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ 
        error: 'Unexpected file field',
        details: 'Only single video file is allowed'
      });
    }
  }
  
  if (err.code === 'INVALID_FILE_TYPE') {
    return res.status(400).json({ 
      error: 'Invalid file type',
      details: err.message
    });
  }
  
  next(err);
};

// Get all videos
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, categoryId } = req.query;
    const offset = (page - 1) * limit;
    
    const where = { userId: req.user.id };
    if (status) where.status = status;
    if (categoryId) where.categoryId = categoryId;

    const videos = await Video.findAndCountAll({
      where,
      include: [
        { model: Category, attributes: ['id', 'name', 'color'] },
        { model: PublishLog, attributes: ['id', 'status', 'createdAt'] }
      ],
      limit: parseInt(limit),
      offset,
      order: [['createdAt', 'DESC']]
    });

    res.json({
      videos: videos.rows,
      total: videos.count,
      page: parseInt(page),
      pages: Math.ceil(videos.count / limit)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Upload video с улучшенной обработкой ошибок
router.post('/upload', authMiddleware, (req, res, next) => {
  upload.single('video')(req, res, (err) => {
    if (err) {
      return handleUploadErrors(err, req, res, next);
    }
    next();
  });
}, [
  body('title').notEmpty().trim(),
  body('description').optional().trim(),
  body('hashtags').optional().trim(),
  body('categoryId').optional().isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }

    console.log('📹 Processing uploaded video:', {
      originalname: req.file.originalname,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype
    });

    const { title, description, hashtags, categoryId, priority } = req.body;

    // Get video metadata
    const metadata = await videoService.getVideoMetadata(req.file.path);

    const video = await Video.create({
      userId: req.user.id,
      categoryId: categoryId || null,
      title,
      description,
      filename: req.file.filename,
      filepath: req.file.path,
      filesize: req.file.size,
      duration: metadata.duration,
      hashtags,
      priority: priority || 0
    });

    const videoWithCategory = await Video.findByPk(video.id, {
      include: [{ model: Category, attributes: ['id', 'name', 'color'] }]
    });

    console.log('✅ Video uploaded successfully:', {
      id: video.id,
      title: video.title,
      duration: metadata.duration
    });

    res.status(201).json({
      message: 'Video uploaded successfully',
      video: videoWithCategory
    });
  } catch (error) {
    console.error('❌ Video upload error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update video
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { title, description, hashtags, categoryId, status, priority } = req.body;
    
    const video = await Video.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    await video.update({
      title: title || video.title,
      description,
      hashtags,
      categoryId: categoryId || video.categoryId,
      status: status || video.status,
      priority: priority !== undefined ? priority : video.priority
    });

    const updatedVideo = await Video.findByPk(video.id, {
      include: [{ model: Category, attributes: ['id', 'name', 'color'] }]
    });

    res.json({
      message: 'Video updated successfully',
      video: updatedVideo
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete video
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const video = await Video.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Delete file from disk
    try {
      await require('fs').promises.unlink(video.filepath);
      console.log('🗑️ Video file deleted:', video.filepath);
    } catch (fileError) {
      console.error('Error deleting file:', fileError);
    }

    await video.destroy();
    res.json({ message: 'Video deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get supported video formats
router.get('/formats', (req, res) => {
  res.json({
    supportedExtensions: [
      '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv', 
      '.m4v', '.3gp', '.3g2', '.mts', '.m2ts', '.ts', '.vob',
      '.ogv', '.dv', '.f4v', '.asf', '.rm', '.rmvb', '.divx'
    ],
    supportedMimeTypes: [
      'video/mp4',
      'video/avi', 
      'video/quicktime',
      'video/x-msvideo',
      'video/x-ms-wmv',
      'video/x-flv',
      'video/webm',
      'video/x-matroska',
      'video/3gpp',
      'video/3gpp2',
      'video/mp2t',
      'video/ogg',
      'video/x-f4v',
      'video/x-ms-asf'
    ],
    maxFileSize: '200MB',
    recommendations: [
      'MP4 format is recommended for best compatibility',
      'MOV files are fully supported',
      'Maximum file size: 200MB',
      'Ensure your video is properly encoded'
    ]
  });
});

module.exports = router;