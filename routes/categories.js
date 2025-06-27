const express = require('express');
const { body, validationResult } = require('express-validator');
const { Category } = require('../models');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Get all categories
router.get('/', authMiddleware, async (req, res) => {
  try {
    const categories = await Category.findAll({
      where: { userId: req.user.id }
    });
    res.json(categories);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create category
router.post('/', authMiddleware, [
  body('name').notEmpty().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description, color } = req.body;

    const category = await Category.create({
      userId: req.user.id,
      name,
      description,
      color: color || '#007bff'
    });

    res.status(201).json({
      message: 'Category created successfully',
      category
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update category
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { name, description, color } = req.body;
    
    const category = await Category.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    await category.update({ name, description, color });

    res.json({
      message: 'Category updated successfully',
      category
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete category
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const category = await Category.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    await category.destroy();
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;