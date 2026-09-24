/**
 * MIGRATION SCRIPT: Assign orderIndex to all existing Materials & Notes
 *
 * Separate from migrate_order_index.js on purpose — that script already ran
 * against Exam (and would blindly re-number it again if re-run, overwriting
 * any manual Display Order edits made since). This script only ever touches
 * the `materials` collection.
 *
 * Logic:
 *   - Covers all 4 Material types: BoardPaper, SchoolPaper, Notes, ImageMaterial
 *   - Group records by (type + subject + standard + board + medium + stream) —
 *     this must match checkDuplicateOrderIndex() in materialController.js
 *     exactly, so migrated data won't collide with the live duplicate check.
 *   - Within each group, sort by createdAt ASC (oldest first)
 *   - Assign orderIndex 1, 2, 3... sequentially
 *
 * Usage: node migrate_material_order_index.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Material = require('./models/Material');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

// Mirrors normalizeStream() in materialController.js so groups line up
// with how the live duplicate check normalizes stream.
const normalizeStream = (stream) => {
  if (!stream || stream === 'None' || stream === '-') return 'None';
  return stream;
};

const GROUP_FIELDS = ['type', 'subject', 'standard', 'board', 'medium', 'stream'];

async function migrateMaterials() {
  console.log('─── Migrating: Material (all types) ───');
  // Matches the scope checkDuplicateOrderIndex() and getAllMaterials() use —
  // soft-deleted records don't count toward the live duplicate check, so they
  // shouldn't consume a slot in the sequence either.
  const records = await Material.find({ isDeleted: { $ne: true } }).sort({ createdAt: 1 }).lean();
  console.log(`  Found ${records.length} records`);
  if (records.length === 0) return;

  // Group by composite key
  const groups = {};
  for (const rec of records) {
    const key = GROUP_FIELDS
      .map(f => {
        const val = f === 'stream' ? normalizeStream(rec.stream) : rec[f];
        return (val || 'unknown').toString().trim().toLowerCase();
      })
      .join('|');
    if (!groups[key]) groups[key] = [];
    groups[key].push(rec);
  }
  console.log(`  Unique groups: ${Object.keys(groups).length}`);

  // Build bulk ops: assign 1,2,3... within each group
  const bulkOps = [];
  for (const [groupKey, groupRecords] of Object.entries(groups)) {
    console.log(`  [${groupKey}]: ${groupRecords.length} record(s)`);
    groupRecords.forEach((rec, idx) => {
      bulkOps.push({
        updateOne: {
          filter: { _id: rec._id },
          update: { $set: { orderIndex: idx + 1 } }
        }
      });
    });
  }

  const result = await Material.bulkWrite(bulkOps);
  console.log(`  ✅ Updated ${result.modifiedCount} records`);
}

async function main() {
  if (!MONGO_URI) {
    console.error('❌ MONGO_URI not found. Check dmbhatt-api/.env');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected!\n');

  try {
    await migrateMaterials();
  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Done! Migration complete.');
  }
}

main();
