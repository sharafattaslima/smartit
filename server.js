const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// 🔴 ডাটাবেস কানেকশন
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://sharafattaslima20625_db_user:Smart1234@sharafat.pnaikku.mongodb.net/?appName=sharafat";

mongoose.connect(MONGODB_URI)
  .then(() => console.log("✅ Database Connected Successfully!"))
  .catch(err => console.error("❌ Database Connection Error:", err));

// 💡 লাইসেন্স স্কিমা (১ পিসির লিমিট)
const licenseSchema = new mongoose.Schema({
    key: String,
    maxDevices: { type: Number, default: 1 }, // 🔴 এখানে 1 করে দেওয়া হয়েছে
    registeredDevices: [String],
    isActive: { type: Boolean, default: true },
    expiryDate: Date // ⏳ এক্সপায়ার ডেট
});
const License = mongoose.model('License', licenseSchema);

// API 1: লাইসেন্স চেক
app.post('/api/license/authorize', async (req, res) => {
    const { licenseKey, fingerprint } = req.body;
    const license = await License.findOne({ key: licenseKey });

    if (!license) return res.status(403).json({ ok: false, message: "Invalid license key" });
    if (!license.isActive) return res.status(403).json({ ok: false, message: "License revoked or blocked" });

    // ⏳ চেক: এক্সপায়ার ডেট পার হয়ে গেছে কি না?
    if (license.expiryDate && new Date() > new Date(license.expiryDate)) {
        license.isActive = false;
        await license.save();
        return res.status(403).json({ ok: false, message: "License Expired!" });
    }

    // পিসি ম্যাচ করলে অ্যাপ্রুভ
    if (license.registeredDevices.includes(fingerprint)) {
        return res.json({ ok: true, message: "Browser approved." });
    }

    // 🔒 চেক: ম্যাক্সিমাম পিসি লিমিট (১ পিসি) পার হয়েছে কি না?
    if (license.registeredDevices.length < license.maxDevices) {
        // প্রথমবার লগইন করলে পিসির আইডি সেভ করবে
        license.registeredDevices.push(fingerprint);
        await license.save();
        return res.json({ ok: true, message: "Device registered and locked to this PC." });
    }

    // অন্য পিসি হলে সোজা ব্লক
    return res.status(403).json({ ok: false, message: "Hardware Mismatch! This key is already locked to another PC." });
});

// API 2: আসল কোড পাঠানো (script.js ফাইল থেকে)
app.post('/api/bundle', async (req, res) => {
    const { licenseKey, fingerprint } = req.body;
    const license = await License.findOne({ key: licenseKey });

    if (license && license.isActive && license.registeredDevices.includes(fingerprint)) {
        
        // ⏳ চেক: এক্সপায়ার ডেট পার হয়ে গেছে কি না?
        if (license.expiryDate && new Date() > new Date(license.expiryDate)) {
            return res.status(403).send("console.error('License Expired!');");
        }

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
        res.status(403).send("console.error('Unauthorized Access or Hardware Mismatch!');");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server is running on port " + PORT));
