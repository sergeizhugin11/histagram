const express = require('express');
const { body, validationResult } = require('express-validator');
const { PublishSchedule, Category, TikTokAccount } = require('../models');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Get all schedules
router.get('/', authMiddleware, async (req, res) => {
  try {
    const schedules = await PublishSchedule.findAll({
      where: { userId: req.user.id },
      include: [
        { 
          model: Category, 
          attributes: ['id', 'name', 'color'],
          required: false 
        }
      ],
      order: [['priority', 'DESC'], ['createdAt', 'DESC']]
    });
    res.json(schedules);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create schedule
router.post('/', authMiddleware, [
  body('name').notEmpty().trim(),
  body('schedule').isObject(),
  body('maxPostsPerDay').isInt({ min: 1, max: 50 }),
  body('maxPostsPerHour').isInt({ min: 1, max: 10 }),
  body('minIntervalMinutes').isInt({ min: 1, max: 1440 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { 
      name, 
      categoryId, 
      schedule, 
      maxPostsPerDay, 
      maxPostsPerHour, 
      minIntervalMinutes,
      accountIds,
      accountRotation,
      priority,
      timezone
    } = req.body;

    // Validate category belongs to user if provided
    if (categoryId) {
      const category = await Category.findOne({
        where: { id: categoryId, userId: req.user.id }
      });
      if (!category) {
        return res.status(400).json({ error: 'Category not found' });
      }
    }

    // Validate accounts belong to user if provided
    if (accountIds && accountIds.length > 0) {
      const userAccounts = await TikTokAccount.findAll({
        where: { userId: req.user.id },
        attributes: ['id']
      });
      const userAccountIds = userAccounts.map(acc => acc.id);
      const invalidAccounts = accountIds.filter(id => !userAccountIds.includes(id));
      
      if (invalidAccounts.length > 0) {
        return res.status(400).json({ 
          error: `Invalid account IDs: ${invalidAccounts.join(', ')}` 
        });
      }
    }

    const publishSchedule = await PublishSchedule.create({
      userId: req.user.id,
      name,
      categoryId: categoryId || null,
      schedule,
      maxPostsPerDay,
      maxPostsPerHour,
      minIntervalMinutes,
      accountIds: accountIds || [],
      accountRotation: accountRotation || 'round_robin',
      priority: priority || 0,
      timezone: timezone || 'UTC'
    });

    const scheduleWithCategory = await PublishSchedule.findByPk(publishSchedule.id, {
      include: [{ model: Category, attributes: ['id', 'name', 'color'] }]
    });

    res.status(201).json({
      message: 'Publish schedule created successfully',
      schedule: scheduleWithCategory
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update schedule
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const schedule = await PublishSchedule.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    const { 
      name, 
      categoryId, 
      schedule: scheduleData, 
      maxPostsPerDay, 
      maxPostsPerHour, 
      minIntervalMinutes,
      accountIds,
      accountRotation,
      isActive,
      priority,
      timezone
    } = req.body;

    await schedule.update({
      name: name || schedule.name,
      categoryId: categoryId !== undefined ? categoryId : schedule.categoryId,
      schedule: scheduleData || schedule.schedule,
      maxPostsPerDay: maxPostsPerDay || schedule.maxPostsPerDay,
      maxPostsPerHour: maxPostsPerHour || schedule.maxPostsPerHour,
      minIntervalMinutes: minIntervalMinutes || schedule.minIntervalMinutes,
      accountIds: accountIds || schedule.accountIds,
      accountRotation: accountRotation || schedule.accountRotation,
      isActive: isActive !== undefined ? isActive : schedule.isActive,
      priority: priority !== undefined ? priority : schedule.priority,
      timezone: timezone || schedule.timezone
    });

    const updatedSchedule = await PublishSchedule.findByPk(schedule.id, {
      include: [{ model: Category, attributes: ['id', 'name', 'color'] }]
    });

    res.json({
      message: 'Schedule updated successfully',
      schedule: updatedSchedule
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete schedule
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const schedule = await PublishSchedule.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    await schedule.destroy();
    res.json({ message: 'Schedule deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get schedule statistics
router.get('/:id/stats', authMiddleware, async (req, res) => {
  try {
    const schedule = await PublishSchedule.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    // TODO: Implement statistics calculation
    // - Posts published today/this week/this month
    // - Next scheduled publish time
    // - Average posts per day
    
    res.json({
      totalPublished: schedule.totalPublished,
      lastProcessedAt: schedule.lastProcessedAt,
      isActive: schedule.isActive
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;