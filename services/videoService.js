// services/videoService.js - Альтернативная версия без FFprobe (если установка не удалась)
const path = require('path');
const fs = require('fs');

class VideoService {
  constructor() {
    this.ffmpegAvailable = false;
    this.initializeFFmpeg();
  }

  async initializeFFmpeg() {
    try {
      const ffmpeg = require('fluent-ffmpeg');
      const ffmpegStatic = require('ffmpeg-static');
      
      // Пытаемся установить пути
      ffmpeg.setFfmpegPath(ffmpegStatic);
      
      // Пытаемся установить ffprobe если есть
      try {
        const ffprobeStatic = require('ffprobe-static');
        ffmpeg.setFfprobePath(ffprobeStatic.path);
        this.ffmpeg = ffmpeg;
        this.ffmpegAvailable = true;
        console.log('✅ FFmpeg with FFprobe initialized successfully');
      } catch (probeError) {
        console.log('⚠️ FFprobe not available, using basic video service');
        this.ffmpegAvailable = false;
      }
    } catch (error) {
      console.log('⚠️ FFmpeg not available, using basic video service');
      this.ffmpegAvailable = false;
    }
  }

  async getVideoMetadata(videoPath) {
    if (this.ffmpegAvailable && this.ffmpeg) {
      // Используем FFprobe если доступен
      return this.getMetadataWithFFprobe(videoPath);
    } else {
      // Fallback - только базовая информация о файле
      return this.getBasicVideoInfo(videoPath);
    }
  }

  async getMetadataWithFFprobe(videoPath) {
    return new Promise((resolve, reject) => {
      console.log('🔍 Getting metadata with FFprobe for:', videoPath);
      
      this.ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          console.error('❌ FFprobe error, falling back to basic info:', err.message);
          // Fallback к базовой информации
          this.getBasicVideoInfo(videoPath)
            .then(resolve)
            .catch(reject);
        } else {
          console.log('✅ Metadata obtained with FFprobe');
          
          const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
          const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');
          
          const result = {
            duration: parseFloat(metadata.format.duration) || 0,
            width: videoStream?.width || 0,
            height: videoStream?.height || 0,
            bitrate: parseInt(metadata.format.bit_rate) || 0,
            format: metadata.format.format_name || 'unknown',
            size: parseInt(metadata.format.size) || 0,
            videoCodec: videoStream?.codec_name || 'unknown',
            audioCodec: audioStream?.codec_name || 'none',
            fps: this.parseFPS(videoStream?.r_frame_rate) || 0
          };
          
          console.log('📊 Video metadata:', result);
          resolve(result);
        }
      });
    });
  }

  async getBasicVideoInfo(videoPath) {
    try {
      console.log('📁 Getting basic file info for:', videoPath);
      
      const stats = fs.statSync(videoPath);
      const extension = path.extname(videoPath).toLowerCase();
      
      // Определяем примерную длительность на основе размера файла (очень грубая оценка)
      const estimatedDuration = this.estimateDurationFromSize(stats.size, extension);
      
      const result = {
        duration: estimatedDuration,
        width: 0, // Неизвестно без FFprobe
        height: 0,
        bitrate: 0,
        format: extension.slice(1) || 'unknown',
        size: stats.size,
        videoCodec: 'unknown',
        audioCodec: 'unknown',
        fps: 0,
        filename: path.basename(videoPath),
        filesize: stats.size,
        createdAt: stats.birthtime,
        isEstimated: true // Флаг что данные приблизительные
      };
      
      console.log('📊 Basic video info:', result);
      return result;
    } catch (error) {
      console.error('❌ Error getting basic video info:', error);
      throw new Error(`Failed to get video information: ${error.message}`);
    }
  }

  // Грубая оценка длительности на основе размера файла
  estimateDurationFromSize(fileSize, extension) {
    // Средний битрейт для разных форматов (kbps)
    const avgBitrates = {
      '.mp4': 2000,   // 2 Mbps
      '.mov': 5000,   // 5 Mbps (обычно больше)
      '.avi': 3000,   // 3 Mbps
      '.wmv': 1500,   // 1.5 Mbps
      '.flv': 1000,   // 1 Mbps
      '.webm': 1500,  // 1.5 Mbps
      '.mkv': 3000,   // 3 Mbps
    };
    
    const avgBitrate = avgBitrates[extension] || 2000; // Дефолт 2 Mbps
    const fileSizeInBits = fileSize * 8;
    const bitrateInBps = avgBitrate * 1000;
    
    return Math.round(fileSizeInBits / bitrateInBps);
  }

  parseFPS(fpsString) {
    if (!fpsString) return 0;
    const parts = fpsString.split('/');
    if (parts.length === 2) {
      return Math.round(parseInt(parts[0]) / parseInt(parts[1]));
    }
    return parseFloat(fpsString) || 0;
  }

  async compressVideo(inputPath, outputPath, options = {}) {
    if (!this.ffmpegAvailable) {
      throw new Error('Video compression not available - FFmpeg not installed');
    }
    
    return new Promise((resolve, reject) => {
      const { width = 720, quality = 23, preset = 'fast' } = options;
      
      console.log('🎬 Starting video compression:', {
        input: inputPath,
        output: outputPath,
        width,
        quality,
        preset
      });
      
      this.ffmpeg(inputPath)
        .outputOptions([
          `-vf scale=${width}:-2`,
          `-crf ${quality}`,
          `-preset ${preset}`,
          '-movflags +faststart'
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log('🚀 FFmpeg command:', commandLine);
        })
        .on('progress', (progress) => {
          console.log('⏳ Compression progress:', Math.round(progress.percent || 0) + '%');
        })
        .on('end', () => {
          console.log('✅ Video compression completed');
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('❌ Video compression error:', err);
          reject(err);
        })
        .run();
    });
  }

  // Проверка возможностей сервиса
  getCapabilities() {
    return {
      ffmpegAvailable: this.ffmpegAvailable,
      canGetMetadata: this.ffmpegAvailable,
      canCompress: this.ffmpegAvailable,
      canGenerateThumbnails: this.ffmpegAvailable,
      fallbackMode: !this.ffmpegAvailable
    };
  }
}

module.exports = new VideoService();