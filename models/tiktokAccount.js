// models/tiktokAccount.js
module.exports = (sequelize, DataTypes) => {
  const TikTokAccount = sequelize.define('TikTokAccount', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    accountName: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Пользовательское название аккаунта'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Описание аккаунта'
    },
    tiktokUserId: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'open_id от TikTok'
    },
    tiktokUnionId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'union_id от TikTok (если доступен)'
    },
    displayName: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Отображаемое имя в TikTok'
    },
    avatarUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'URL аватара пользователя'
    },
    isVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Верифицирован ли аккаунт в TikTok'
    },
    followerCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Количество подписчиков'
    },
    followingCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Количество подписок'
    },
    likesCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Общее количество лайков'
    },
    videoCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Количество видео'
    },
    accessToken: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: 'Access token для API'
    },
    refreshToken: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Refresh token для обновления access token'
    },
    tokenExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Время истечения access token'
    },
    scope: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Разрешения (scopes) для токена'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Активен ли аккаунт для публикации'
    },
    lastPublishAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Время последней публикации'
    },
    lastSyncAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Время последней синхронизации данных профиля'
    },
    errorCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Количество ошибок подряд (для автоотключения)'
    },
    lastError: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Последняя ошибка'
    }
  }, {
    timestamps: true,
    tableName: 'tiktok_accounts',
    indexes: [
      {
        fields: ['userId']
      },
      {
        fields: ['tiktokUserId'],
        unique: false // Может быть несколько записей с одним open_id у разных пользователей
      },
      {
        unique: true,
        fields: ['userId', 'tiktokUserId'] // Уникальная комбинация
      },
      {
        fields: ['isActive']
      },
      {
        fields: ['tokenExpiresAt']
      }
    ],
    hooks: {
      // Автоматически обновляем lastSyncAt при изменении данных профиля
      beforeUpdate: (account, options) => {
        const profileFields = ['displayName', 'avatarUrl', 'followerCount', 'followingCount', 'likesCount', 'videoCount'];
        const changedFields = Object.keys(account.changed());
        
        if (profileFields.some(field => changedFields.includes(field))) {
          account.lastSyncAt = new Date();
        }
      }
    }
  });

  // Методы экземпляра
  TikTokAccount.prototype.isTokenExpired = function() {
    return this.tokenExpiresAt && new Date() >= this.tokenExpiresAt;
  };

  TikTokAccount.prototype.needsRefresh = function() {
    if (!this.tokenExpiresAt) return false;
    
    // Обновляем за 5 минут до истечения
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
    return fiveMinutesFromNow >= this.tokenExpiresAt;
  };

  TikTokAccount.prototype.incrementError = function(errorMessage) {
    this.errorCount += 1;
    this.lastError = errorMessage;
    
    // Автоматически отключаем после 5 ошибок подряд
    if (this.errorCount >= 5) {
      this.isActive = false;
    }
    
    return this.save();
  };

  TikTokAccount.prototype.resetErrors = function() {
    this.errorCount = 0;
    this.lastError = null;
    return this.save();
  };

  TikTokAccount.prototype.getPublicData = function() {
    const data = this.toJSON();
    delete data.accessToken;
    delete data.refreshToken;
    return data;
  };

  return TikTokAccount;
};