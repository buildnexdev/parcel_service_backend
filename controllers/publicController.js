const pool = require('../config/db');

exports.trackParcel = async (req, res) => {
  try {
    const { query } = req.params;
    if (!query || query.trim() === '') {
      return res.status(400).json({ success: false, message: 'Please enter a valid LR Number or Phone Number.' });
    }

    const searchTerm = query.trim();

    // Query by exact LR number or sender/receiver phone
    const [orders] = await pool.query(
      `SELECT 
        o.id, o.lr_number, o.booking_date, o.booking_time, 
        o.sender_name, o.receiver_name, 
        o.from_station, o.to_station, 
        o.pieces, o.weight_kg, o.description, 
        o.delivery_status, o.payment_mode, o.payment_status,
        o.delivery_date
       FROM orders o
       WHERE o.lr_number = ? OR o.receiver_phone = ? OR o.sender_phone = ?
       ORDER BY o.id DESC LIMIT 5`,
      [searchTerm, searchTerm, searchTerm]
    );

    if (orders.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No parcel found matching "${searchTerm}". Please check your LR / Way Bill Number.`
      });
    }

    const matchedOrder = orders[0];

    // Fetch tracking checkpoints
    const [checkpoints] = await pool.query(
      `SELECT status, location, note, created_at 
       FROM tracking_history 
       WHERE order_id = ? 
       ORDER BY created_at ASC`,
      [matchedOrder.id]
    );

    return res.json({
      success: true,
      order: matchedOrder,
      checkpoints,
      total_matches: orders.length
    });
  } catch (err) {
    console.error('Track parcel error:', err);
    return res.status(500).json({ success: false, message: 'Server error tracking parcel' });
  }
};

exports.getBranches = async (req, res) => {
  try {
    const [branches] = await pool.query('SELECT * FROM branches ORDER BY is_head_office DESC, is_branch_office DESC, name ASC');
    return res.json({ success: true, branches });
  } catch (err) {
    console.error('Get branches error:', err);
    return res.status(500).json({ success: false, message: 'Server error retrieving branches' });
  }
};

exports.getCompanyInfo = async (req, res) => {
  return res.json({
    success: true,
    company: {
      tradeName: 'ES TRANSPORTERS',
      brandName: 'IGR QUICK PARCEL SERVICE',
      proprietor: 'MATHAVAN',
      partner: 'K. SELVAGANABATHY',
      gstin: '34BJCPM0785J1Z3',
      headOffice: {
        title: 'Head Office - Karaikal',
        address: 'No. 18, Sastha Nagar, Near Radio Station, Karaikal - 609 602 (Church St Reg: 32, Church Street)',
        phones: ['93604 27527', '96555 66060'],
        contacts: [
          { name: 'Mathavan', designation: 'Proprietor', phone: '93604 27527' },
          { name: 'K. Selvaganabathy', designation: 'Partner', phone: '96555 66060' }
        ]
      },
      branchOffice: {
        title: 'Branch Office - Pondicherry',
        address: 'No. 9, Throwpathi Amman Kovil Street, Arumathapuram, Puducherry - 605 110',
        phones: ['94424 85296', '93604 27527', '96555 66060']
      },
      hotlines: ['94424 85296', '93604 27527', '96555 66060', '90476 36351'],
      coverage: [
        'Pondicherry',
        'Cuddalore',
        'Chidambaram',
        'Parangipettai',
        'Sirkali',
        'Mayiladuthurai',
        'Karaikal',
        'Nagore',
        'Nagapattinam',
        'Thiruvarur',
        'Thiruthuraipoondi',
        'Vedaranyam'
      ],
      features: [
        'Daily Regular Express Service',
        'Karaikal - Pondicherry Express Hub',
        'Reliable Door Delivery & Pickups',
        'Transparent To-Pay / Paid / Credit Modes',
        'Safe Handling & Live Run Sheet Logging'
      ]
    }
  });
};

exports.createInquiry = async (req, res) => {
  try {
    const { name, phone, email, from_station, to_station, message } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ success: false, message: 'Please provide your name and phone number.' });
    }

    const cleanPhone = phone.toString().replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      return res.status(400).json({ success: false, message: 'Phone number must be exactly 10 digits.' });
    }

    await pool.query(
      `INSERT INTO inquiries (name, phone, email, from_station, to_station, message)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name.trim(), phone.trim(), email || null, from_station || null, to_station || null, message || null]
    );

    return res.status(201).json({
      success: true,
      message: 'Thank you! Your message has been received. Our team will contact you shortly.'
    });
  } catch (err) {
    console.error('Inquiry error:', err);
    return res.status(500).json({ success: false, message: 'Server error submitting inquiry' });
  }
};
