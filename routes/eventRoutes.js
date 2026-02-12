const express = require('express');
const router = express.Router();
const eventController = require('../controllers/eventController');
const multer = require('multer');
const { storage } = require('../config/uploadConfig'); // Import shared Cloudinary storage

const upload = multer({ storage: storage });

// Routes
router.post('/create', upload.array('images', 10), eventController.createEvent);
router.put('/update/:id', upload.array('images', 10), eventController.updateEvent); // Added update route
router.get('/all', eventController.getAllEvents);
router.get('/:id', eventController.getEventById);
router.delete('/:id', eventController.deleteEvent);

module.exports = router;
