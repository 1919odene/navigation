/**
 * ================================================================
 * FILE: routes/zones.js  — Zone CRUD + Occupancy Routes
 * ================================================================
 *
 * ENDPOINTS:
 *   GET    /zones           → return all zones as GeoJSON FeatureCollection
 *   POST   /zones           → admin creates a new zone (with drawn geometry)
 *   DELETE /zones/:id       → admin deletes a zone
 *   PATCH  /zones/:id/occupy → pastoralist starts grazing → zone turns gray
 *   PATCH  /zones/:id/vacate → pastoralist leaves → zone turns green again
 *
 * REAL-TIME:
 *   After every occupy/vacate, we emit "zone:updated" via Socket.IO.
 *   Every connected app immediately re-renders the map without refresh.
 *
 * GEOJSON FEATURECOLLECTION FORMAT (returned by GET /zones):
 *   {
 *     type: "FeatureCollection",
 *     features: [
 *       {
 *         type: "Feature",
 *         properties: { name, type, occupiedBy, ... },
 *         geometry: { type: "Polygon", coordinates: [[...]] }
 *       },
 *       ...
 *     ]
 *   }
 *   Leaflet's L.geoJSON() can render this directly.
 */

const express = require('express');
const Zone    = require('../models/Zone');
const { protect, requireAdmin } = require('../middleware/auth');
const { getIO } = require('../sockets/socketHandler');

const router = express.Router();

// ── GET /zones ────────────────────────────────────────────────
// Public — called when the map loads to draw all zone polygons.
// Also called by the ESP32 on boot to download fence coordinates.
router.get('/', async (req, res) => {
  try {
    const zones = await Zone.find(); // get all zones from MongoDB

    // Convert to GeoJSON FeatureCollection so Leaflet can use it directly
    const featureCollection = {
      type: 'FeatureCollection',
      features: zones.map((z) => ({
        type: 'Feature',
        properties: {
          _id:        z._id,
          name:       z.name,
          type:       z.type,         // 'restricted' | 'available' | 'occupied'
          description: z.description,
          occupiedBy: z.occupiedBy,   // { userId, userName, since } or null
        },
        geometry: z.geometry,         // the GeoJSON shape as drawn by admin
      })),
    };

    res.json(featureCollection);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /zones ────────────────────────────────────────────────
// Admin only. Body comes from Leaflet.draw in AdminMapScreen.
// Leaflet.draw gives us a GeoJSON layer — we just save its geometry.
// Body: { name, type, description, geometry }
router.post('/', protect, requireAdmin, async (req, res) => {
  try {
    const { name, type, description, geometry } = req.body;

    if (!name || !type || !geometry)
      return res.status(400).json({ error: 'name, type, and geometry required' });

    const zone = await Zone.create({ name, type, description, geometry });

    // Tell all connected apps there's a new zone — map re-renders
    getIO().emit('zone:updated', { action: 'created', zone });

    res.status(201).json(zone);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /zones/:id ──────────────────────────────────────────
// Admin only. Removes a zone and notifies all apps.
router.delete('/:id', protect, requireAdmin, async (req, res) => {
  try {
    const zone = await Zone.findByIdAndDelete(req.params.id);
    if (!zone) return res.status(404).json({ error: 'Zone not found' });

    getIO().emit('zone:updated', { action: 'deleted', zoneId: req.params.id });
    res.json({ message: 'Zone deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /zones/:id/occupy ────────────────────────────────────
// Called when pastoralist presses "Start grazing" in ZoneDetailScreen.
// Changes zone type to 'occupied' and records who/when.
// All other apps see the zone turn gray instantly via Socket.IO.
router.patch('/:id/occupy', protect, async (req, res) => {
  try {
    const zone = await Zone.findById(req.params.id);
    if (!zone) return res.status(404).json({ error: 'Zone not found' });

    if (zone.type === 'occupied')
      return res.status(409).json({ error: `Zone already occupied by ${zone.occupiedBy.userName}` });

    if (zone.type === 'restricted')
      return res.status(403).json({ error: 'Cannot occupy a restricted zone' });

    // Mark as occupied
    zone.type = 'occupied';
    zone.occupiedBy = {
      userId:   req.user._id,
      userName: req.user.name,
      since:    new Date(),
    };
    await zone.save();

    // Broadcast to ALL connected apps — map turns gray for everyone
    getIO().emit('zone:updated', { action: 'occupied', zone });

    res.json(zone);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /zones/:id/vacate ────────────────────────────────────
// Called when pastoralist presses "Leave zone".
// Resets zone to 'available' (green) for all users.
router.patch('/:id/vacate', protect, async (req, res) => {
  try {
    const zone = await Zone.findById(req.params.id);
    if (!zone) return res.status(404).json({ error: 'Zone not found' });

    // Only the person who occupied it (or admin) can vacate it
    const isOwner = zone.occupiedBy?.userId?.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== 'admin')
      return res.status(403).json({ error: 'You did not occupy this zone' });

    zone.type       = 'available';
    zone.occupiedBy = { userId: null, userName: null, since: null };
    await zone.save();

    getIO().emit('zone:updated', { action: 'vacated', zone });

    res.json(zone);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
