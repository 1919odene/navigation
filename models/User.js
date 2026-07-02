/**
 * ================================================================
 * FILE: models/User.js   — MongoDB User Schema
 * ================================================================
 *
 * WHAT IS A MONGOOSE MODEL?
 *   Mongoose is the library connecting Node.js to MongoDB.
 *   A "Schema" defines the exact shape of each document (row).
 *   A "Model" wraps the schema and gives you methods like
 *   User.find(), User.create(), user.save(), etc.
 *
 * TWO ROLES:
 *   pastoralist → logs in with phone + password
 *   admin       → logs in with username + password
 */

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,         // strips leading/trailing whitespace
    },

    // Optional username used for admin login
    username: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },

    // Phone number = primary identifier for pastoralists
    // Format: +255712345678 (Tanzania)
    phone: {
      type: String,
      required: true,
      unique: true,
    },

    // Password is stored HASHED — never plain text (see hook below)
    password: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      enum: ['pastoralist', 'admin'],
      default: 'pastoralist',
    },

    // Phone's last known GPS — updated every 15 s by the app
    lastLocation: {
      lat:       { type: Number, default: null },
      lng:       { type: Number, default: null },
      updatedAt: { type: Date,   default: null },
    },
  },
  { timestamps: true }   // adds createdAt, updatedAt automatically
);

// ── Pre-save hook: hash the password before storing ───────────
// This runs automatically whenever a user document is saved.
// bcrypt turns "mypassword123" into a long random-looking string
// that cannot be reversed — even if the DB is leaked.
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next(); // only if password changed
  this.password = await bcrypt.hash(this.password, 10); // 10 = salt rounds
  next();
});

// ── Instance method: check a password at login ────────────────
// Usage inside a route:
//   const match = await user.comparePassword(req.body.password);
userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
