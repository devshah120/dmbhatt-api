const Event = require('../models/Event');
const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2; // Ensure cloudinary is required if needed for deletion

// Create a new event
exports.createEvent = async (req, res) => {
    try {
        const { title, description, date } = req.body;
        const files = req.files;

        if (!title) {
            return res.status(400).json({ message: 'Title is required' });
        }

        let images = [];
        if (files && files.length > 0) {
            // Multer-storage-cloudinary puts the URL in 'path'
            images = files.map(file => file.path);
        }

        const newEvent = new Event({
            title,
            description,
            date: date || Date.now(),
            images
        });

        await newEvent.save();

        res.status(201).json({
            message: 'Event created successfully',
            event: newEvent
        });
    } catch (error) {
        console.error('Error creating event:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Update an event
exports.updateEvent = async (req, res) => {
    try {
        const { title, description, date, existingImages } = req.body;
        const files = req.files;
        const eventId = req.params.id;

        const event = await Event.findById(eventId);
        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }

        if (title) event.title = title;
        if (description) event.description = description;
        if (date) event.date = date;

        // Handle images
        let currentImages = event.images || [];

        // If existingImages is provided (as a JSON string or array), filter current images
        // This allows deleting images by not sending them back
        if (existingImages) {
            const keptImages = Array.isArray(existingImages) ? existingImages : [existingImages];
            // Identify deleted images to remove from Cloudinary (optional optimization)
            const deletedImages = currentImages.filter(img => !keptImages.includes(img));
            // TODO: Add Cloudinary delete logic here if needed using public_id

            currentImages = keptImages;
        }

        // Add new images
        if (files && files.length > 0) {
            const newImageUrls = files.map(file => file.path);
            currentImages = [...currentImages, ...newImageUrls];
        }

        event.images = currentImages;

        await event.save();

        res.status(200).json({
            message: 'Event updated successfully',
            event: event
        });
    } catch (error) {
        console.error('Error updating event:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Get all events
exports.getAllEvents = async (req, res) => {
    try {
        const events = await Event.find().sort({ date: -1 });
        res.status(200).json(events);
    } catch (error) {
        console.error('Error fetching events:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Get event by ID
exports.getEventById = async (req, res) => {
    try {
        const event = await Event.findById(req.params.id);
        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }
        res.status(200).json(event);
    } catch (error) {
        console.error('Error fetching event:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Delete event
exports.deleteEvent = async (req, res) => {
    try {
        const event = await Event.findById(req.params.id);
        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }

        // Cloudinary deletion logic (Optional but recommended)
        // Extract public_id from URL if possible to delete from Cloudinary

        await Event.findByIdAndDelete(req.params.id);

        res.status(200).json({ message: 'Event deleted successfully' });
    } catch (error) {
        console.error('Error deleting event:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
