/**
 * ================================================================
 * FILE: routes/routes.js  — Safe Route Lines
 * ================================================================
 *
 * ENDPOINTS:
 *   GET    /routes       → all safe routes (blue dashed lines on map)
 *   POST   /routes       → admin draws a new route
 *   DELETE /routes/:id   → admin removes a route
 *
 * These are the blue dashed lines on the map that guide pastoralists
 * through safe corridors between grazing zones.
 * Stored as GeoJSON LineStrings.
 */

const express  = require('express');
const Route    = require('../models/Route');
const { protect, requireAdmin } = require('../middleware/auth');
const { getIO } = require('../sockets/socketHandler');

const router = express.Router();

// GET /routes — public, called when map loads
router.get('/', async (req, res) => {
  try {
    const routes = await Route.find();
    // Wrap in GeoJSON FeatureCollection for Leaflet
    const fc = {
      type: 'FeatureCollection',
      features: routes.map((r) => ({
        type: 'Feature',
        properties: { _id: r._id, name: r.name, description: r.description },
        geometry: r.geometry,
      })),
    };
    res.json(fc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /routes — admin creates route from Leaflet.draw polyline
// Body: { name, description, geometry, fromZone?, toZone? }
router.post('/', protect, requireAdmin, async (req, res) => {
  try {
    const route = await Route.create(req.body);
    getIO().emit('route:updated', { action: 'created', route });
    res.status(201).json(route);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /routes/:id — admin removes a route
router.delete('/:id', protect, requireAdmin, async (req, res) => {
  try {
    await Route.findByIdAndDelete(req.params.id);
    getIO().emit('route:updated', { action: 'deleted', routeId: req.params.id });
    res.json({ message: 'Route deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
