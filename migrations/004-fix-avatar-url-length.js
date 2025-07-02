// migrations/004-fix-avatar-url-length.js
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🔧 Fixing avatarUrl field length...');
    
    // Изменяем тип поля avatarUrl на TEXT чтобы поддерживать длинные URL
    await queryInterface.changeColumn('tiktok_accounts', 'avatarUrl', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'URL аватара пользователя (может быть очень длинным)'
    });
    
    console.log('✅ avatarUrl field updated to TEXT type');
  },

  down: async (queryInterface, Sequelize) => {
    // Откатываем обратно к STRING (но это может вызвать ошибки если есть длинные URL)
    await queryInterface.changeColumn('tiktok_accounts', 'avatarUrl', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'URL аватара пользователя'
    });
  }
};