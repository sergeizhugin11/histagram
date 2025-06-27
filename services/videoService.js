const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');

// Set the path to the ffmpeg binary
ffmpeg.setFfmpegPath(ffmpegStatic);

class VideoService {
  async getVideoMetadata(videoPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(err);
        } else {
          const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
          resolve({
            duration: metadata.format.duration,
            width: videoStream?.width,
            height: videoStream?.height,
            bitrate: metadata.format.bit_rate,
            format: metadata.format.format_name
          });
        }
      });
    });
  }

  async compressVideo(inputPath, outputPath, options = {}) {
    return new Promise((resolve, reject) => {
      const { width = 720, quality = 23 } = options;
      
      ffmpeg(inputPath)
        .outputOptions([
          `-vf scale=${width}:-2`,
          `-crf ${quality}`,
          '-preset fast',
          '-movflags +faststart'
        ])
        .output(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', reject)
        .run();
    });
  }
}

module.exports = new VideoService();