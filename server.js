const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// 🔴 ডাটাবেস কানেকশন (Render Environment থেকে নেবে)
const MONGODB_URI = process.env.MONGODB_URI;

// 🔴 আপনার সিক্রেট অ্যাডমিন পাসওয়ার্ড
const ADMIN_PASS = "smart123"; 

mongoose.connect(MONGODB_URI)
  .then(() => console.log("✅ Database Connected Successfully!"))
  .catch(err => console.error("❌ Database Connection Error:", err));

// 💡 লাইসেন্স স্কিমা (অটো ৩০ দিন মেয়াদ)
const licenseSchema = new mongoose.Schema({
    key: { type: String, unique: true, required: true },
    maxDevices: { type: Number, default: 1 }, 
    registeredDevices: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    expiryDate: { 
        type: Date, 
        default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) 
    }
});
const License = mongoose.model('License', licenseSchema);

// ==========================================
// 🛠️ অ্যাডমিন কন্ট্রোল API (আপনার জন্য)
// ==========================================

// ১. নতুন লাইসেন্স তৈরি: /api/admin/create?key=NAME&pass=smart123
app.get('/api/admin/create', async (req, res) => {
    if (req.query.pass !== ADMIN_PASS) return res.send("❌ Wrong Password!");
    if (!req.query.key) return res.send("❌ Key missing!");
    try {
        const newLicense = new License({ key: req.query.key });
        await newLicense.save();
        res.send(`✅ Success! [${req.query.key}] created with 30 days validity.`);
    } catch (err) { res.send("❌ Key already exists!"); }
});

// ২. পিসি লক রিসেট: /api/admin/reset?key=NAME&pass=smart123
app.get('/api/admin/reset', async (req, res) => {
    if (req.query.pass !== ADMIN_PASS) return res.send("❌ Wrong Password!");
    const license = await License.findOne({ key: req.query.key });
    if (!license) return res.send("❌ Not found!");
    license.registeredDevices = [];
    await license.save();
    res.send(`✅ Success! PC Lock cleared for [${req.query.key}].`);
});

// ৩. মেয়াদ বাড়ানো: /api/admin/extend?key=NAME&days=30&pass=smart123
app.get('/api/admin/extend', async (req, res) => {
    if (req.query.pass !== ADMIN_PASS) return res.send("❌ Wrong Password!");
    const days = parseInt(req.query.days) || 30;
    const license = await License.findOne({ key: req.query.key });
    if (!license) return res.send("❌ Not found!");
    const currentExpiry = license.expiryDate && license.expiryDate > new Date() ? new Date(license.expiryDate) : new Date();
    license.expiryDate = new Date(currentExpiry.getTime() + days * 24 * 60 * 60 * 1000);
    license.isActive = true;
    await license.save();
    res.send(`✅ Success! Extended ${days} days for [${req.query.key}].`);
});

// ==========================================
// 🚀 কাস্টমার API (Loader Script এখান থেকে ডাটা নেয়)
// ==========================================

app.post('/api/license/authorize', async (req, res) => {
    const { licenseKey, fingerprint } = req.body;
    const license = await License.findOne({ key: licenseKey });

    if (!license || !license.isActive) return res.status(403).json({ ok: false, message: "Invalid Key" });
    if (license.expiryDate && new Date() > new Date(license.expiryDate)) return res.status(403).json({ ok: false, message: "Expired" });

    if (license.registeredDevices.includes(fingerprint)) return res.json({ ok: true });
    if (license.registeredDevices.length < license.maxDevices) {
        license.registeredDevices.push(fingerprint);
        await license.save();
        return res.json({ ok: true });
    }
    return res.status(403).json({ ok: false, message: "Locked to another PC" });
});

app.post('/api/bundle', async (req, res) => {
    const { licenseKey, fingerprint } = req.body;
    const license = await License.findOne({ key: licenseKey });
    if (license && license.isActive && license.registeredDevices.includes(fingerprint)) {
        try {
            const scriptPath = path.join(__dirname, 'script.js');
            const rawScript = fs.readFileSync(scriptPath, 'utf8');
            res.type('text/plain').send(rawScript);
        } catch (error) { res.status(500).send("File Error"); }
    } else { res.status(403).send("Unauthorized"); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server Live"));
