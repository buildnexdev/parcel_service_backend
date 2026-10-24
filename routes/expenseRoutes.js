const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const authMiddleware = require('../middleware/auth');
const { requirePermission } = require('../middleware/permission');

router.use(authMiddleware);

router.get('/', requirePermission('expenses', 'view'), expenseController.getExpenses);
router.post('/', requirePermission('expenses', 'add'), expenseController.createExpense);
router.get('/:id', requirePermission('expenses', 'view'), expenseController.getExpenseById);
router.put('/:id', requirePermission('expenses', 'edit'), expenseController.updateExpense);
router.delete('/:id', requirePermission('expenses', 'delete'), expenseController.deleteExpense);

module.exports = router;
