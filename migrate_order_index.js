/**
 * MIGRATION SCRIPT: Assign orderIndex to all existing Exams & Materials
 * 
 * Logic:
 *   - Group records by (subject + std + board + medium + stream)
 *   - Within each group, sort by createdAt ASC (oldest first)
 *   - Assign orderIndex 1, 2, 3... sequentially
 * 
 * Usage: node migrate_order_index.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

// ─── Schemas (minimal - just what we need) ────────────────────────────────────

const examSchema = new mongoose.Schema({ title: String, subject: String, std: String, board: String, medium: String, stream: String, orderIndex: Number }, { timestamps: true, collection: 'exams' });
const fiveMinTestSchema = new mongoose.Schema({ title: String, subject: String, std: String, board: String, medium: String, stream: String, orderIndex: Number }, { timestamps: true, collection: 'fivemintests' });
const matchFollowingSchema = new mongoose.Schema({ title: String, subject: String, std: String, board: String, medium: String, stream: String, orderIndex: Number }, { timestamps: true, collection: 'matchfollowingexams' });
const oneLinerSchema = new mongoose.Schema({ title: String, subject: String, std: String, board: String, medium: String, stream: String, orderIndex: Number }, { timestamps: true, collection: 'onelinerexams' });
const trueFalseSchema = new mongoose.Schema({ title: String, subject: String, std: String, board: String, medium: String, stream: String, orderIndex: Number }, { timestamps: true, collection: 'truefalseexams' });
const materialSchema = new mongoose.Schema({ title: String, subject: String, type: String, std: String, standard: String, board: String, medium: String, stream: String, orderIndex: Number }, { timestamps: true, collection: 'materials' });

const Exam           = mongoose.model('Exam',           examSchema);
const FiveMinTest    = mongoose.model('FiveMinTest',    fiveMinTestSchema);
const MatchFollowing = mongoose.model('MatchFollowing', matchFollowingSchema);
const OneLiner       = mongoose.model('OneLiner',       oneLinerSchema);
const TrueFalse      = mongoose.model('TrueFalse',      trueFalseSchema);
const Material       = mongoose.model('Material',       materialSchema);

// ─── Core Migration Function ──────────────────────────────────────────────────

async function migrateModel(Model, modelName, groupFields) {
  console.log(`\n─── Migrating: ${modelName} ───`);
  const records = await Model.find({}).sort({ createdAt: 1 }).lean();
  console.log(`  Found ${records.length} records`);
  if (records.length === 0) return;

  // Group by composite key
  const groups = {};
  for (const rec of records) {
    const key = groupFields.map(f => (rec[f] || 'unknown').toString().trim().toLowerCase()).join('|');
    if (!groups[key]) groups[key] = [];
    groups[key].push(rec);
  }
  console.log(`  Unique groups: ${Object.keys(groups).length}`);

  // Build bulk ops: assign 1,2,3... within each group
  const bulkOps = [];
  for (const [groupKey, groupRecords] of Object.entries(groups)) {
    const parts = groupKey.split('|');
    console.log(`  [${parts.slice(0, 3).join('/')}]: ${groupRecords.length} records`);
    groupRecords.forEach((rec, idx) => {
      bulkOps.push({
        updateOne: {
          filter: { _id: rec._id },
          update: { $set: { orderIndex: idx + 1 } }
        }
      });
    });
  }

  const result = await Model.bulkWrite(bulkOps);
  console.log(`  ✅ Updated ${result.modifiedCount} records`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!MONGO_URI) {
    console.error('❌ MONGO_URI not found. Check dmbhatt-api/.env');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected!\n');

  try {
    await migrateModel(Exam,           'Exam',           ['subject', 'std', 'board', 'medium', 'stream']);
    await migrateModel(FiveMinTest,    'FiveMinTest',    ['subject', 'std', 'board', 'medium', 'stream']);
    await migrateModel(MatchFollowing, 'MatchFollowing', ['subject', 'std', 'board', 'medium', 'stream']);
    await migrateModel(OneLiner,       'OneLiner',       ['subject', 'std', 'board', 'medium', 'stream']);
    await migrateModel(TrueFalse,      'TrueFalse',      ['subject', 'std', 'board', 'medium', 'stream']);
    await migrateModel(Material,       'Material',       ['type', 'subject', 'standard', 'board', 'medium']);
  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Done! Migration complete.');
  }
}

main();
