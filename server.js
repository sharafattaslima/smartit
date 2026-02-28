const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// ডাটাবেস কানেকশন
const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI)
  .then(() => console.log("Database Connected Successfully!"))
  .catch(err => console.error("Database Connection Error:", err));

// লাইসেন্স স্কিমা
const licenseSchema = new mongoose.Schema({
    key: String,
    maxDevices: { type: Number, default: 2 },
    registeredDevices: [String],
    isActive: { type: Boolean, default: true }
});
const License = mongoose.model('License', licenseSchema);

// API 1: লাইসেন্স চেক
app.post('/api/license/authorize', async (req, res) => {
    const { licenseKey, fingerprint } = req.body;
    const license = await License.findOne({ key: licenseKey });

    if (!license) return res.status(403).json({ ok: false, message: "Invalid license key" });
    if (!license.isActive) return res.status(403).json({ ok: false, message: "License revoked or expired" });

    if (license.registeredDevices.includes(fingerprint)) {
        return res.json({ ok: true, message: "Browser approved." });
    }

    if (license.registeredDevices.length < license.maxDevices) {
        license.registeredDevices.push(fingerprint);
        await license.save();
        return res.json({ ok: true, message: "New device registered." });
    }

    return res.status(403).json({ ok: false, message: "Device limit reached. Waiting for admin approval." });
});

// API 2: আসল কোড পাঠানো (আলাদা ফাইল থেকে)
app.post('/api/bundle', async (req, res) => {
    const { licenseKey, fingerprint } = req.body;
    const license = await License.findOne({ key: licenseKey });

    if (license && license.isActive && license.registeredDevices.includes(fingerprint)) {
        try {
            // script.js ফাইল থেকে কোড পড়ে ব্রাউজারে পাঠাবে
            const scriptPath = path.join(__dirname, 'script.js');
            const rawScript = fs.readFileSync(scriptPath, 'utf8');
            res.type('text/plain').send(rawScript);
        } catch (error) {
            console.error("Script file missing!");
            res.status(500).send("console.error('Server error: script.js file not found!');");
        }
    } else {
        res.status(403).send("console.error('Unauthorized Access');");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server is running on port " + PORT));