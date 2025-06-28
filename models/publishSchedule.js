module.exports = (sequelize, DataTypes) => {
  const PublishSchedule = sequelize.define('PublishSchedule', {
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
    categoryId: {
      type: DataTypes.INTEGER,
      allowNull: true, // null = для всех категорий
      references: {
        model: 'categories',
        key: 'id'
      }
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Название расписания'
    },
    // Расписание в формате cron или JSON
    schedule: {
      type: DataTypes.JSONB,
      allowNull: false,
      comment: 'Гибкое расписание: {days: [1,2,3], hours: [9,12,15], timezone: "UTC"}'
    },
    // Ограничения публикации
    maxPostsPerDay: {
      type: DataTypes.INTEGER,
      defaultValue: 5,
      comment: 'Максимум постов в день'
    },
    maxPostsPerHour: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      comment: 'Максимум постов в час'
    },
    minIntervalMinutes: {
      type: DataTypes.INTEGER,
      defaultValue: 30,
      comment: 'Минимальный интервал между постами в минутах'
    },
    // Настройки аккаунтов
    accountIds: {
      type: DataTypes.ARRAY(DataTypes.INTEGER),
      defaultValue: [],
      comment: 'ID аккаунтов для публикации, пустой массив = все активные'
    },
    accountRotation: {
      type: DataTypes.ENUM('round_robin', 'random', 'priority'),
      defaultValue: 'round_robin',
      comment: 'Способ выбора аккаунта'
    },
    // Статус и настройки
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    priority: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Приоритет расписания (больше = выше)'
    },
    timezone: {
      type: DataTypes.STRING,
      defaultValue: 'UTC',
      comment: 'Часовой пояс для расписания'
    },
    // Статистика
    lastProcessedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    totalPublished: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    timestamps: true,
    tableName: 'publish_schedules',
    indexes: [
      {
        fields: ['userId', 'isActive']
      },
      {
        fields: ['categoryId']
      }
    ]
  });

  return PublishSchedule;
};