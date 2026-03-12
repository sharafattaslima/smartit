const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// 🔴 আপনার ডাটাবেস লিংক
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://sharafattaslima20625_db_user:Smart1234@sharafat.pnaikku.mongodb.net/?appName=sharafat";

// 🔴 আপনার অ্যাডমিন পাসওয়ার্ড (এটি দিয়ে আপনি ব্রাউজার থেকে কন্ট্রোল করবেন)
const ADMIN_PASS = "smart123"; 

mongoose.connect(MONGODB_URI)
  .then(() => console.log("✅ Database Connected Successfully!"))
  .catch(err => console.error("❌ Database Connection Error:", err));

// 💡 লাইসেন্স স্কিমা (অটো ৩০ দিন মেয়াদ সেট করা হয়েছে)
const licenseSchema = new mongoose.Schema({
    key: { type: String, unique: true, required: true },
    maxDevices: { type: Number, default: 1 }, 
    registeredDevices: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    expiryDate: { 
        type: Date, 
        // নতুন বানালেই অটোমেটিক বর্তমান সময় থেকে ৩০ দিন যোগ হয়ে যাবে
        default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) 
    }
});
const License = mongoose.model('License', licenseSchema);


// ==========================================
// 🛠️ সিক্রেট অ্যাডমিন কন্ট্রোল (ব্রাউজার থেকে করার জন্য)
// ==========================================

// ১. নতুন লাইসেন্স বানানো (অটো ৩০ দিন):
app.get('/api/admin/create', async (req, res) => {
    if (req.query.pass !== ADMIN_PASS) return res.send("❌ Wrong Password!");
    if (!req.query.key) return res.send("❌ Please provide a key. Example: ?key=VIP-01");

    try {
        const newLicense = new License({ key: req.query.key });
        await newLicense.save();
        res.send(`✅ Success! Key [${req.query.key}] is created. It will automatically expire after 30 days.`);
    } catch (err) {
        res.send("❌ Error: Key already exists or database error.");
    }
});

// ২. পিসি লক রিসেট করা (উইন্ডোজ দিলে বা পিসি বদলালে):
app.get('/api/admin/reset', async (req, res) => {
    if (req.query.pass !== ADMIN_PASS) return res.send("❌ Wrong Password!");
    
    const license = await License.findOne({ key: req.query.key });
    if (!license) return res.send("❌ Key not found!");

    license.registeredDevices = []; // ডিভাইস ক্লিয়ার করে দিলাম
    await license.save();
    res.send(`✅ Success! PC Lock cleared for [${req.query.key}]. Customer can login on a new PC now.`);
});

// ৩. মেয়াদ বাড়ানো (Extend Expiry):
app.get('/api/admin/extend', async (req, res) => {
    if (req.query.pass !== ADMIN_PASS) return res.send("❌ Wrong Password!");
    
    const days = parseInt(req.query.days) || 30; // বাই ডিফল্ট ৩০ দিন বাড়াবে
    const license = await License.findOne({ key: req.query.key });
    if (!license) return res.send("❌ Key not found!");

    const currentExpiry = license.expiryDate && license.expiryDate > new Date() ? new Date(license.expiryDate) : new Date();
    license.expiryDate = new Date(currentExpiry.getTime() + days * 24 * 60 * 60 * 1000);
    license.isActive = true; // ব্লক থাকলে আনব্লক হয়ে যাবে
    await license.save();
    res.send(`✅ Success! Added ${days} more days to [${req.query.key}].`);
});


// ==========================================
// 🚀 ক্লায়েন্টদের জন্য API (আগের মতোই থাকবে)
// ==========================================

app.post('/api/license/authorize', async (req, res) => {
    const { licenseKey, fingerprint } = req.body;
    const license = await License.findOne({ key: licenseKey });

    if (!license) return res.status(403).json({ ok: false, message: "Invalid license key" });
    if (!license.isActive) return res.status(403).json({ ok: false, message: "License revoked or blocked" });

    if (license.expiryDate && new Date() > new Date(license.expiryDate)) {
        license.isActive = false;
        await license.save();
        return res.status(403).json({ ok: false, message: "License Expired!" });
    }

    if (license.registeredDevices.includes(fingerprint)) {
        return res.json({ ok: true, message: "Browser approved." });
    }

    if (license.registeredDevices.length < license.maxDevices) {
        license.registeredDevices.push(fingerprint);
        await license.save();
        return res.json({ ok: true, message: "Device registered and locked to this PC." });
    }

    return res.status(403).json({ ok: false, message: "Hardware Mismatch! This key is already locked to another PC." });
});

app.post('/api/bundle', async (req, res) => {
    const { licenseKey, fingerprint } = req.body;
    const license = await License.findOne({ key: licenseKey });

    if (license && license.isActive && license.registeredDevices.includes(fingerprint)) {
        if (license.expiryDate && new Date() > new Date(license.expiryDate)) {
            return res.status(403).send("console.error('License Expired!');");
        }
        try {
            const scriptPath = path.join(__dirname, 'script.js');
            const rawScript = fs.readFileSync(scriptPath, 'utf8');
            res.type('text/plain').send(rawScript);
        } catch (error) {
            res.status(500).send("console.error('Server error: script.js file not found!');");
        }
    } else {
        res.status(403).send("console.error('Unauthorized Access or Hardware Mismatch!');");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server is running on port " + PORT));
