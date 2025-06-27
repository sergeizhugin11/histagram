const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize({
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  dialect: 'postgres',
  logging: false,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

const User = require('./user')(sequelize, Sequelize.DataTypes);
const TikTokAccount = require('./tiktokAccount')(sequelize, Sequelize.DataTypes);
const Category = require('./category')(sequelize, Sequelize.DataTypes);
const Video = require('./video')(sequelize, Sequelize.DataTypes);
const PublishLog = require('./publishLog')(sequelize, Sequelize.DataTypes);

// Associations
User.hasMany(TikTokAccount, { foreignKey: 'userId' });
TikTokAccount.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(Category, { foreignKey: 'userId' });
Category.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(Video, { foreignKey: 'userId' });
Video.belongsTo(User, { foreignKey: 'userId' });

Category.hasMany(Video, { foreignKey: 'categoryId' });
Video.belongsTo(Category, { foreignKey: 'categoryId' });

TikTokAccount.hasMany(PublishLog, { foreignKey: 'accountId' });
PublishLog.belongsTo(TikTokAccount, { foreignKey: 'accountId' });

Video.hasMany(PublishLog, { foreignKey: 'videoId' });
PublishLog.belongsTo(Video, { foreignKey: 'videoId' });

module.exports = {
  sequelize,
  User,
  TikTokAccount,
  Category,
  Video,
  PublishLog
};