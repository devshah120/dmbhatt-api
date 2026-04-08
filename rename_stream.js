const mongoose = require('mongoose');

async function run() {
    await mongoose.connect('mongodb://localhost:27017/dmbhatt_academy');
    console.log('Connected to DB');

    const db = mongoose.connection.db;

    // Convert 'General' -> 'Commerce' in subjects
    const subjectsRes = await db.collection('subjects').updateMany(
        { stream: 'General' },
        { $set: { stream: 'Commerce' } }
    );
    console.log(`Updated ${subjectsRes.modifiedCount} subjects from General to Commerce.`);

    // Convert 'General' -> 'Commerce' in studentprofiles
    const studentsRes = await db.collection('studentprofiles').updateMany(
        { stream: 'General' },
        { $set: { stream: 'Commerce' } }
    );
    console.log(`Updated ${studentsRes.modifiedCount} students from General to Commerce.`);

    mongoose.disconnect();
}

run().catch(console.error);
