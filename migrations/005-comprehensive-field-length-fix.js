// migrations/005-comprehensive-field-length-fix.js
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🔧 Fixing field lengths for TikTok data...');
    
    // Исправляем все поля, которые могут быть длинными
    const fieldsToFix = [
      {
        field: 'scope',
        type: Sequelize.TEXT,
        comment: 'Разрешения (scopes) для токена - может быть длинным списком'
      },
      {
        field: 'tiktokUserId', 
        type: Sequelize.STRING(100), // Увеличиваем до 100 символов
        comment: 'open_id от TikTok'
      },
      {
        field: 'tiktokUnionId',
        type: Sequelize.STRING(100), // Увеличиваем до 100 символов  
        comment: 'union_id от TikTok (если доступен)'
      },
      {
        field: 'displayName',
        type: Sequelize.STRING(500), // Увеличиваем для поддержки emoji и длинных имен
        comment: 'Отображаемое имя в TikTok'
      }
    ];

    for (const fieldConfig of fieldsToFix) {
      try {
        console.log(`📝 Updating field: ${fieldConfig.field}`);
        
        await queryInterface.changeColumn('tiktok_accounts', fieldConfig.field, {
          type: fieldConfig.type,
          allowNull: true,
          comment: fieldConfig.comment
        });
        
        console.log(`✅ Field ${fieldConfig.field} updated successfully`);
      } catch (error) {
        console.error(`❌ Error updating field ${fieldConfig.field}:`, error.message);
        // Продолжаем с другими полями
      }
    }

    // Также исправляем likesCount - может быть очень большим числом
    try {
      console.log('📝 Updating likesCount to BIGINT...');
      
      await queryInterface.changeColumn('tiktok_accounts', 'likesCount', {
        type: Sequelize.BIGINT,
        defaultValue: 0,
        comment: 'Общее количество лайков (может быть очень большим)'
      });
      
      console.log('✅ likesCount updated to BIGINT');
    } catch (error) {
      console.error('❌ Error updating likesCount:', error.message);
    }

    console.log('🎉 Field length fixes completed!');
  },

  down: async (queryInterface, Sequelize) => {
    console.log('🔄 Rolling back field length fixes...');
    
    // Откатываем изменения (осторожно - может вызвать потерю данных)
    const rollbackFields = [
      { field: 'scope', type: Sequelize.STRING },
      { field: 'tiktokUserId', type: Sequelize.STRING },
      { field: 'tiktokUnionId', type: Sequelize.STRING },
      { field: 'displayName', type: Sequelize.STRING },
      { field: 'likesCount', type: Sequelize.INTEGER }
    ];

    for (const fieldConfig of rollbackFields) {
      try {
        await queryInterface.changeColumn('tiktok_accounts', fieldConfig.field, {
          type: fieldConfig.type,
          allowNull: true
        });
        console.log(`✅ Rolled back field: ${fieldConfig.field}`);
      } catch (error) {
        console.error(`❌ Error rolling back field ${fieldConfig.field}:`, error.message);
      }
    }
  }
};