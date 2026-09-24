/**
 * MIGRATION SCRIPT: Re-assign orderIndex to all existing Exams
 *
 * Separate from migrate_order_index.js on purpose — that script already ran
 * against this collection once but left large groups still tied at
 * orderIndex=1 (e.g. 20+ GSEB/Std12/English/Commerce exams all sitting at 1),
 * most likely because many exams were created after that one-time run, each
 * defaulting back to orderIndex=1. This script re-derives a clean sequence
 * from current data without touching the other collections
 * (FiveMinTest/MatchFollowing/OneLiner/TrueFalse/Material) that
 * migrate_order_index.js also covers.
 *
 * Logic:
 *   - Group records by (subject + std + board + medium + stream) — this must
 *     match checkDuplicateOrderIndex() in examController.js exactly, so
 *     migrated data won't collide with the live duplicate check.
 *   - Within each group, sort by createdAt ASC (oldest first)
 *   - Assign orderIndex 1, 2, 3... sequentially
 *
 * Usage: node migrate_exam_order_index.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Exam = require('./models/Exam');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

// Mirrors normalizeStream() in examController.js so groups line up with how
// the live duplicate check normalizes stream.
const normalizeStream = (stream) => {
  if (!stream || stream === 'None' || stream === '-') return 'None';
  return stream;
};

const GROUP_FIELDS = ['subject', 'std', 'board', 'medium', 'stream'];

async function migrateExams() {
  console.log('─── Migrating: Exam ───');
  // Matches the scope checkDuplicateOrderIndex() and getAllExams() use —
  // soft-deleted records don't count toward the live duplicate check, so
  // they shouldn't consume a slot in the sequence either.
  const records = await Exam.find({ isDeleted: { $ne: true } }).sort({ createdAt: 1 }).lean();
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

  // Report groups that currently have duplicate orderIndex ties, before fixing them.
  let tiedGroups = 0;
  for (const [groupKey, groupRecords] of Object.entries(groups)) {
    const seen = new Set();
    let hasDup = false;
    for (const rec of groupRecords) {
      const oi = rec.orderIndex || 1;
      if (seen.has(oi)) hasDup = true;
      seen.add(oi);
    }
    if (hasDup) {
      tiedGroups++;
      console.log(`  [DUPLICATE TIES] ${groupKey}: ${groupRecords.length} record(s)`);
    }
  }
  console.log(`  Groups with duplicate orderIndex ties: ${tiedGroups}`);

  // Build bulk ops: assign 1,2,3... within each group
  const bulkOps = [];
  for (const [groupKey, groupRecords] of Object.entries(groups)) {
    groupRecords.forEach((rec, idx) => {
      bulkOps.push({
        updateOne: {
          filter: { _id: rec._id },
          update: { $set: { orderIndex: idx + 1 } }
        }
      });
    });
  }

  const result = await Exam.bulkWrite(bulkOps);
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
    await migrateExams();
  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Done! Migration complete.');
  }
}

main();
