// migrations/003-update-tiktok-accounts.js
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Добавляем новые поля для OAuth и расширенной информации профиля
    await queryInterface.addColumn('tiktok_accounts', 'description', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Описание аккаунта'
    });

    await queryInterface.addColumn('tiktok_accounts', 'tiktokUnionId', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'union_id от TikTok (если доступен)'
    });

    await queryInterface.addColumn('tiktok_accounts', 'displayName', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'Отображаемое имя в TikTok'
    });

    await queryInterface.addColumn('tiktok_accounts', 'avatarUrl', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'URL аватара пользователя'
    });

    await queryInterface.addColumn('tiktok_accounts', 'isVerified', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      comment: 'Верифицирован ли аккаунт в TikTok'
    });

    await queryInterface.addColumn('tiktok_accounts', 'followerCount', {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      comment: 'Количество подписчиков'
    });

    await queryInterface.addColumn('tiktok_accounts', 'followingCount', {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      comment: 'Количество подписок'
    });

    await queryInterface.addColumn('tiktok_accounts', 'likesCount', {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      comment: 'Общее количество лайков'
    });

    await queryInterface.addColumn('tiktok_accounts', 'videoCount', {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      comment: 'Количество видео'
    });

    await queryInterface.addColumn('tiktok_accounts', 'scope', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'Разрешения (scopes) для токена'
    });

    await queryInterface.addColumn('tiktok_accounts', 'lastSyncAt', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Время последней синхронизации данных профиля'
    });

    await queryInterface.addColumn('tiktok_accounts', 'errorCount', {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      comment: 'Количество ошибок подряд (для автоотключения)'
    });

    await queryInterface.addColumn('tiktok_accounts', 'lastError', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Последняя ошибка'
    });

    // Добавляем индексы для оптимизации
    await queryInterface.addIndex('tiktok_accounts', {
      fields: ['userId', 'tiktokUserId'],
      unique: true,
      name: 'tiktok_accounts_user_tiktok_unique'
    });

    await queryInterface.addIndex('tiktok_accounts', {
      fields: ['isActive'],
      name: 'tiktok_accounts_is_active_idx'
    });

    await queryInterface.addIndex('tiktok_accounts', {
      fields: ['tokenExpiresAt'],
      name: 'tiktok_accounts_token_expires_idx'
    });

    console.log('✅ TikTok accounts table updated with OAuth fields');
  },

  down: async (queryInterface, Sequelize) => {
    // Удаляем индексы
    await queryInterface.removeIndex('tiktok_accounts', 'tiktok_accounts_user_tiktok_unique');
    await queryInterface.removeIndex('tiktok_accounts', 'tiktok_accounts_is_active_idx');
    await queryInterface.removeIndex('tiktok_accounts', 'tiktok_accounts_token_expires_idx');

    // Удаляем добавленные поля
    await queryInterface.removeColumn('tiktok_accounts', 'description');
    await queryInterface.removeColumn('tiktok_accounts', 'tiktokUnionId');
    await queryInterface.removeColumn('tiktok_accounts', 'displayName');
    await queryInterface.removeColumn('tiktok_accounts', 'avatarUrl');
    await queryInterface.removeColumn('tiktok_accounts', 'isVerified');
    await queryInterface.removeColumn('tiktok_accounts', 'followerCount');
    await queryInterface.removeColumn('tiktok_accounts', 'followingCount');
    await queryInterface.removeColumn('tiktok_accounts', 'likesCount');
    await queryInterface.removeColumn('tiktok_accounts', 'videoCount');
    await queryInterface.removeColumn('tiktok_accounts', 'scope');
    await queryInterface.removeColumn('tiktok_accounts', 'lastSyncAt');
    await queryInterface.removeColumn('tiktok_accounts', 'errorCount');
    await queryInterface.removeColumn('tiktok_accounts', 'lastError');
  }
};