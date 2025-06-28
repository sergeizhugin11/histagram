'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('publish_schedules', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      categoryId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'categories',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      schedule: {
        type: Sequelize.JSONB,
        allowNull: false
      },
      maxPostsPerDay: {
        type: Sequelize.INTEGER,
        defaultValue: 5
      },
      maxPostsPerHour: {
        type: Sequelize.INTEGER,
        defaultValue: 1
      },
      minIntervalMinutes: {
        type: Sequelize.INTEGER,
        defaultValue: 30
      },
      accountIds: {
        type: Sequelize.ARRAY(Sequelize.INTEGER),
        defaultValue: []
      },
      accountRotation: {
        type: Sequelize.ENUM('round_robin', 'random', 'priority'),
        defaultValue: 'round_robin'
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      priority: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      timezone: {
        type: Sequelize.STRING,
        defaultValue: 'UTC'
      },
      lastProcessedAt: {
        type: Sequelize.DATE,
        allowNull: true
      },
      totalPublished: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // Create indexes
    await queryInterface.addIndex('publish_schedules', ['userId', 'isActive']);
    await queryInterface.addIndex('publish_schedules', ['categoryId']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('publish_schedules');
  }
};