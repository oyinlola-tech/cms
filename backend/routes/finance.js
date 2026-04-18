const crypto = require('crypto');
const express = require('express');
const { asyncHandler } = require('../utils/async-handler');
const { query } = require('../utils/db');
const { csvEscape, percentChange } = require('../utils/format');
const { parseId, parseLimit, parsePage } = require('../utils/validation');

function createFinanceRouter({ db, authenticate, rateLimiters }) {
  const router = express.Router();

  router.get('/finance/summary', authenticate, rateLimiters.adminRead, asyncHandler(async (req, res) => {
    const rows = await query(
      db,
      `SELECT
        (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='income' AND status='completed')
          - (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='expense' AND status='completed') as balance,
        (SELECT COALESCE(SUM(amount),0) FROM transactions
          WHERE type='income' AND status='completed'
            AND transaction_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
            AND transaction_date < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
        ) as monthlyTithes,
        (SELECT COALESCE(SUM(amount),0) FROM transactions
          WHERE type='expense' AND status='completed'
            AND transaction_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
            AND transaction_date < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
        ) as monthlyExpenses,
        (SELECT COALESCE(SUM(amount),0) FROM transactions
          WHERE type='income' AND status='completed'
            AND transaction_date >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
            AND transaction_date < DATE_FORMAT(CURDATE(), '%Y-%m-01')
        ) as prevMonthlyTithes,
        (SELECT COALESCE(AVG(month_total),0) FROM (
          SELECT SUM(amount) as month_total
          FROM transactions
          WHERE type='income' AND status='completed'
            AND transaction_date >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 6 MONTH)
          GROUP BY YEAR(transaction_date), MONTH(transaction_date)
        ) t) as avgIncome6m,
        (SELECT COALESCE(AVG(month_total),0) FROM (
          SELECT SUM(amount) as month_total
          FROM transactions
          WHERE type='expense' AND status='completed'
            AND transaction_date >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 6 MONTH)
          GROUP BY YEAR(transaction_date), MONTH(transaction_date)
        ) e) as avgExpense6m`
    );

    const data = rows[0] || {};
    const monthlyTithes = Number(data.monthlyTithes || 0);
    const monthlyExpenses = Number(data.monthlyExpenses || 0);
    const avgIncome6m = Number(data.avgIncome6m || 0);
    const avgExpense6m = Number(data.avgExpense6m || 0);
    const progressBase = avgIncome6m > 0 ? avgIncome6m : Math.max(monthlyTithes, 1);
    const tithesProgress = Math.max(0, Math.min(100, Math.round((monthlyTithes / progressBase) * 100)));
    const expenseStatus = avgExpense6m > 0
      ? (monthlyExpenses <= avgExpense6m ? 'Within Budget' : 'Above Budget')
      : (monthlyExpenses === 0 ? 'Within Budget' : 'Above Budget');

    res.json({
      balance: Number(data.balance || 0),
      monthlyTithes,
      monthlyExpenses,
      trend: percentChange(monthlyTithes, data.prevMonthlyTithes),
      tithesProgress,
      expenseStatus
    });
  }));

  router.get('/finance/transactions', authenticate, rateLimiters.adminRead, asyncHandler(async (req, res) => {
    const page = parsePage(req.query.page, 1);
    const limit = parseLimit(req.query.limit, 10, 100);
    const offset = (page - 1) * limit;

    const items = await query(
      db,
      `SELECT id, reference, type, category, amount, description, payment_method, status, transaction_date as date, created_at
       FROM transactions
       ORDER BY transaction_date DESC, id DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    const count = await query(db, 'SELECT COUNT(*) as total FROM transactions');
    const total = Number(count[0]?.total || 0);

    res.json({
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      from: total === 0 ? 0 : offset + 1,
      to: Math.min(offset + limit, total)
    });
  }));

  router.get('/finance/export', authenticate, rateLimiters.export, asyncHandler(async (req, res) => {
    const rows = await query(
      db,
      `SELECT reference, type, category, amount, description, status, payment_method, transaction_date
       FROM transactions
       ORDER BY transaction_date DESC, id DESC`
    );

    const header = ['reference', 'type', 'category', 'amount', 'description', 'status', 'payment_method', 'transaction_date'];
    const csv = [
      header.join(','),
      ...rows.map((row) => header.map((key) => csvEscape(row[key])).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
    res.send(csv);
  }));

  router.post('/finance/transactions', authenticate, rateLimiters.adminWrite, asyncHandler(async (req, res) => {
    const {
      type,
      category,
      amount,
      description,
      member_id,
      payment_method,
      status,
      transaction_date
    } = req.body || {};

    if (type !== 'income' && type !== 'expense') {
      res.status(400).json({ message: 'Invalid type' });
      return;
    }
    if (typeof category !== 'string' || category.trim().length < 2) {
      res.status(400).json({ message: 'Category required' });
      return;
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      res.status(400).json({ message: 'Invalid amount' });
      return;
    }
    if (!transaction_date) {
      res.status(400).json({ message: 'Transaction date required' });
      return;
    }

    const memberId = member_id ? parseId(member_id) : null;
    if (member_id && !memberId) {
      res.status(400).json({ message: 'Invalid member' });
      return;
    }

    const reference = `TX-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const result = await query(
      db,
      `INSERT INTO transactions
        (reference, type, category, amount, description, member_id, payment_method, status, transaction_date, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        reference,
        type,
        category.trim(),
        parsedAmount,
        description || null,
        memberId,
        payment_method || 'cash',
        status || 'completed',
        transaction_date,
        req.userId
      ]
    );

    res.status(201).json({ id: result.insertId, reference, message: 'Transaction created' });
  }));

  return router;
}

module.exports = { createFinanceRouter };
