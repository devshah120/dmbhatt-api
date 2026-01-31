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

exports.updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, category, subject, price, originalPrice, discount } = req.body;

        let product = await ExploreProduct.findById(id);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        // Update fields
        product.name = name || product.name;
        product.description = description || product.description;
        product.category = category || product.category;
        product.subject = subject || product.subject;
        product.price = price || product.price;
        product.originalPrice = originalPrice || product.originalPrice;
        product.discount = discount || product.discount;

        // Handle image update
        if (req.files && req.files['image']) {
            // Optional: Delete old image from Cloudinary here if needed
            product.image = req.files['image'][0].path;
        }

        await product.save();

        res.status(200).json({ message: 'Product updated successfully', product });
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const product = await ExploreProduct.findByIdAndDelete(id);

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        res.status(200).json({ message: 'Product deleted successfully' });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
