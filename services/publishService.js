const { Video, TikTokAccount, PublishLog, PublishSchedule, Category, User } = require('../models');
const tiktokService = require('./tiktokService');
const { Op } = require('sequelize');

class PublishService {
  async publishPendingVideos() {
    try {
      console.log('🚀 Starting smart publish job...');
      
      // Получаем активные расписания
      const activeSchedules = await PublishSchedule.findAll({
        where: { isActive: true },
        include: [
          { model: Category, required: false },
          { 
            model: User, 
            include: [{ model: TikTokAccount, where: { isActive: true }, required: false }]
          }
        ],
        order: [['priority', 'DESC']]
      });

      let totalProcessed = 0;

      for (const schedule of activeSchedules) {
        try {
          const processed = await this.processSchedule(schedule);
          totalProcessed += processed;
        } catch (error) {
          console.error(`❌ Error processing schedule ${schedule.id}:`, error);
        }
      }

      // Fallback: обрабатываем видео без расписания (старый метод)
      const fallbackProcessed = await this.processFallbackVideos();
      totalProcessed += fallbackProcessed;

      console.log(`✅ Publish job completed. Total processed: ${totalProcessed}`);
    } catch (error) {
      console.error('❌ Publish service error:', error);
    }
  }

  async processSchedule(schedule) {
    const now = new Date();
    
    // Проверяем, нужно ли сейчас публиковать по этому расписанию
    if (!this.shouldPublishNow(schedule, now)) {
      return 0;
    }

    // Проверяем лимиты публикации
    const canPublish = await this.checkPublishLimits(schedule, now);
    if (!canPublish) {
      console.log(`⏸️ Schedule ${schedule.name} reached publish limits`);
      return 0;
    }

    // Получаем видео для публикации
    const videos = await this.getVideosForSchedule(schedule);
    if (videos.length === 0) {
      console.log(`📭 No videos found for schedule ${schedule.name}`);
      return 0;
    }

    let processed = 0;
    const maxToProcess = Math.min(videos.length, schedule.maxPostsPerHour);

    for (let i = 0; i < maxToProcess; i++) {
      const video = videos[i];
      const account = await this.selectAccountForSchedule(schedule, video);
      
      if (account) {
        const success = await this.publishVideo(video, account);
        if (success) {
          processed++;
          // Обновляем статистику расписания
          await schedule.update({
            totalPublished: schedule.totalPublished + 1,
            lastProcessedAt: now
          });
        }
      }
    }

    console.log(`📊 Schedule "${schedule.name}": processed ${processed} videos`);
    return processed;
  }

  shouldPublishNow(schedule, now) {
    const { schedule: scheduleConfig } = schedule;
    
    // Конвертируем время в часовой пояс расписания
    const localTime = new Date(now.toLocaleString("en-US", {timeZone: schedule.timezone}));
    
    const currentHour = localTime.getHours();
    const currentDay = localTime.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const currentMinute = localTime.getMinutes();

    // Проверяем день недели (если указан)
    if (scheduleConfig.days && scheduleConfig.days.length > 0) {
      if (!scheduleConfig.days.includes(currentDay)) {
        return false;
      }
    }

    // Проверяем часы (если указаны)
    if (scheduleConfig.hours && scheduleConfig.hours.length > 0) {
      if (!scheduleConfig.hours.includes(currentHour)) {
        return false;
      }
    }

    // Проверяем минуты (если указаны конкретные)
    if (scheduleConfig.minutes && scheduleConfig.minutes.length > 0) {
      if (!scheduleConfig.minutes.includes(currentMinute)) {
        return false;
      }
    }

    // Проверяем минимальный интервал с последней публикации
    if (schedule.lastProcessedAt) {
      const timeSinceLastPublish = now - new Date(schedule.lastProcessedAt);
      const minIntervalMs = schedule.minIntervalMinutes * 60 * 1000;
      
      if (timeSinceLastPublish < minIntervalMs) {
        return false;
      }
    }

    return true;
  }

  async checkPublishLimits(schedule, now) {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const hourAgo = new Date(now);
    hourAgo.setHours(hourAgo.getHours() - 1);

    // Считаем публикации за сегодня
    const todayCount = await PublishLog.count({
      include: [{
        model: Video,
        where: schedule.categoryId ? { categoryId: schedule.categoryId } : {},
        include: [{ model: User, where: { id: schedule.userId } }]
      }],
      where: {
        status: 'success',
        createdAt: {
          [Op.gte]: today,
          [Op.lt]: tomorrow
        }
      }
    });

    if (todayCount >= schedule.maxPostsPerDay) {
      return false;
    }

    // Считаем публикации за последний час
    const hourCount = await PublishLog.count({
      include: [{
        model: Video,
        where: schedule.categoryId ? { categoryId: schedule.categoryId } : {},
        include: [{ model: User, where: { id: schedule.userId } }]
      }],
      where: {
        status: 'success',
        createdAt: {
          [Op.gte]: hourAgo
        }
      }
    });

    return hourCount < schedule.maxPostsPerHour;
  }

  async getVideosForSchedule(schedule) {
    const whereCondition = {
      userId: schedule.userId,
      status: 'pending',
      [Op.or]: [
        { publishAt: null },
        { publishAt: { [Op.lte]: new Date() } }
      ]
    };

    // Фильтруем по категории если указана
    if (schedule.categoryId) {
      whereCondition.categoryId = schedule.categoryId;
    }

    return await Video.findAll({
      where: whereCondition,
      order: [['priority', 'DESC'], ['createdAt', 'ASC']],
      limit: schedule.maxPostsPerHour
    });
  }

  async selectAccountForSchedule(schedule, video) {
    // Получаем аккаунты пользователя
    let accounts = await TikTokAccount.findAll({
      where: {
        userId: schedule.userId,
        isActive: true
      }
    });

    // Фильтруем по указанным в расписании аккаунтам
    if (schedule.accountIds && schedule.accountIds.length > 0) {
      accounts = accounts.filter(acc => schedule.accountIds.includes(acc.id));
    }

    if (accounts.length === 0) {
      return null;
    }

    // Выбираем аккаунт по стратегии
    switch (schedule.accountRotation) {
      case 'random':
        return accounts[Math.floor(Math.random() * accounts.length)];
      
      case 'round_robin':
      default:
        // Сортируем по времени последней публикации
        return accounts.sort((a, b) => {
          const aTime = a.lastPublishAt ? new Date(a.lastPublishAt) : new Date(0);
          const bTime = b.lastPublishAt ? new Date(b.lastPublishAt) : new Date(0);
          return aTime - bTime;
        })[0];
    }
  }

  async processFallbackVideos() {
    console.log('🔄 Processing fallback videos (without schedules)...');
    
    // Получаем видео без активных расписаний
    const videos = await Video.findAll({
      where: {
        status: 'pending',
        [Op.or]: [
          { publishAt: null },
          { publishAt: { [Op.lte]: new Date() } }
        ]
      },
      include: [{
        model: Category,
        required: false,
        include: [{
          model: PublishSchedule,
          where: { isActive: true },
          required: false
        }]
      }],
      order: [['priority', 'DESC'], ['createdAt', 'ASC']],
      limit: 5
    });

    // Фильтруем только те видео, у категорий которых нет активных расписаний
    const videosWithoutSchedules = videos.filter(video => 
      !video.Category || !video.Category.PublishSchedules || 
      video.Category.PublishSchedules.length === 0
    );

    let processed = 0;

    for (const video of videosWithoutSchedules) {
      const accounts = await TikTokAccount.findAll({
        where: {
          userId: video.userId,
          isActive: true
        }
      });

      if (accounts.length === 0) continue;

      // Round-robin выбор аккаунта
      const account = accounts.sort((a, b) => {
        const aTime = a.lastPublishAt ? new Date(a.lastPublishAt) : new Date(0);
        const bTime = b.lastPublishAt ? new Date(b.lastPublishAt) : new Date(0);
        return aTime - bTime;
      })[0];

      const success = await this.publishVideo(video, account);
      if (success) {
        processed++;
      }
    }

    console.log(`📊 Fallback processing: ${processed} videos`);
    return processed;
  }

  async publishVideo(video, account) {
    try {
      console.log(`📤 Publishing video "${video.title}" to account ${account.accountName}`);

      // Проверяем и обновляем токен если нужно
      if (account.tokenExpiresAt && new Date() >= account.tokenExpiresAt) {
        if (account.refreshToken) {
          const tokenData = await tiktokService.refreshAccessToken(account.refreshToken);
          await account.update({
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000)
          });
        } else {
          console.error(`🔑 Token expired for account ${account.id} and no refresh token available`);
          return false;
        }
      }

      // Публикуем в TikTok
      const result = await tiktokService.uploadVideo(
        account.accessToken,
        video.filepath,
        video.title,
        video.description,
        video.hashtags
      );

      // Логируем успешную публикацию
      await PublishLog.create({
        videoId: video.id,
        accountId: account.id,
        tiktokVideoId: result.share_id,
        status: 'success',
        response: result
      });

      // Обновляем статусы
      await video.update({ status: 'published' });
      await account.update({ lastPublishAt: new Date() });

      console.log(`✅ Successfully published video ${video.id} to TikTok`);
      return true;

    } catch (error) {
      console.error(`❌ Error publishing video ${video.id}:`, error);

      // Логируем неудачную публикацию
      await PublishLog.create({
        videoId: video.id,
        accountId: account?.id,
        status: 'failed',
        error: error.message
      });

      // Помечаем видео как неудачное
      await video.update({ status: 'failed' });
      return false;
    }
  }
}

module.exports = new PublishService();