const ExploreProduct = require('../models/ExploreProduct');

exports.createProduct = async (req, res) => {
    try {
        const { name, description, category, subject, price, originalPrice, discount } = req.body;

        let imageUrl = '';
        if (req.files && req.files['image']) {
            imageUrl = req.files['image'][0].path; // Cloudinary path from multer-storage-cloudinary
        } else {
            return res.status(400).json({ message: 'Image is required' });
        }

        const newProduct = new ExploreProduct({
            name,
            description,
            category,
            subject,
            price,
            originalPrice,
            discount,
            image: imageUrl
        });

        await newProduct.save();

        res.status(201).json({ message: 'Product created successfully', product: newProduct });
    } catch (error) {
        console.error('Error creating product:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.getAllProducts = async (req, res) => {
    try {
        const products = await ExploreProduct.find().sort({ createdAt: -1 });
        res.status(200).json(products);
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
