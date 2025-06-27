const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { body, validationResult } = require('express-validator');
const { Video, Category, PublishLog } = require('../models');
const authMiddleware = require('../middleware/auth');
const videoService = require('../services/videoService');

const router = express.Router();

// Multer configuration
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
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /mp4|avi|mov|wmv|flv|webm/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only video files are allowed!'));
    }
  }
});

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

// Upload video
router.post('/upload', authMiddleware, upload.single('video'), [
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

    res.status(201).json({
      message: 'Video uploaded successfully',
      video: videoWithCategory
    });
  } catch (error) {
    console.error(error);
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
      await fs.unlink(video.filepath);
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

module.exports = router;