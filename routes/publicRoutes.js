const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');

router.get('/track/:query', publicController.trackParcel);
router.get('/branches', publicController.getBranches);
router.get('/company', publicController.getCompanyInfo);
router.post('/inquiry', publicController.createInquiry);

module.exports = router;
