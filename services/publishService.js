const { Video, TikTokAccount, PublishLog } = require('../models');
const tiktokService = require('./tiktokService');
const { Op } = require('sequelize');

class PublishService {
  async publishPendingVideos() {
    try {
      // Get videos ready to publish
      const videos = await Video.findAll({
        where: {
          status: 'pending',
          [Op.or]: [
            { publishAt: null },
            { publishAt: { [Op.lte]: new Date() } }
          ]
        },
        order: [['priority', 'DESC'], ['createdAt', 'ASC']],
        limit: 5, // Process max 5 videos per run
        include: [
          {
            model: TikTokAccount,
            through: { attributes: [] },
            where: { isActive: true },
            required: false
          }
        ]
      });

      for (const video of videos) {
        await this.publishVideo(video);
      }
    } catch (error) {
      console.error('Publish service error:', error);
    }
  }

  async publishVideo(video) {
    try {
      // Get active TikTok accounts for this user
      const accounts = await TikTokAccount.findAll({
        where: {
          userId: video.userId,
          isActive: true
        }
      });

      if (accounts.length === 0) {
        console.log(`No active TikTok accounts for video ${video.id}`);
        return;
      }

      // Select account based on last publish time (round robin)
      const account = accounts.sort((a, b) => {
        const aTime = a.lastPublishAt ? new Date(a.lastPublishAt) : new Date(0);
        const bTime = b.lastPublishAt ? new Date(b.lastPublishAt) : new Date(0);
        return aTime - bTime;
      })[0];

      console.log(`Publishing video ${video.id} to account ${account.accountName}`);

      // Check if token needs refresh
      if (account.tokenExpiresAt && new Date() >= account.tokenExpiresAt) {
        if (account.refreshToken) {
          const tokenData = await tiktokService.refreshAccessToken(account.refreshToken);
          await account.update({
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000)
          });
        } else {
          console.error(`Token expired for account ${account.id} and no refresh token available`);
          return;
        }
      }

      // Upload to TikTok
      const result = await tiktokService.uploadVideo(
        account.accessToken,
        video.filepath,
        video.title,
        video.description,
        video.hashtags
      );

      // Log successful publish
      await PublishLog.create({
        videoId: video.id,
        accountId: account.id,
        tiktokVideoId: result.share_id,
        status: 'success',
        response: result
      });

      // Update video status
      await video.update({ status: 'published' });

      // Update account last publish time
      await account.update({ lastPublishAt: new Date() });

      console.log(`Successfully published video ${video.id} to TikTok`);

    } catch (error) {
      console.error(`Error publishing video ${video.id}:`, error);

      // Log failed publish
      await PublishLog.create({
        videoId: video.id,
        accountId: account?.id,
        status: 'failed',
        error: error.message
      });

      // Mark video as failed
      await video.update({ status: 'failed' });
    }
  }
}

module.exports = new PublishService();