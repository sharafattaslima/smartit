const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// 🔴 আপনার MongoDB লিংক
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://sharafattaslima20625_db_user:Smart1234@sharafat.pnaikku.mongodb.net/?appName=sharafat";

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
// 🛠️ সিক্রেট অ্যাডমিন কন্ট্রোল (ব্রাউজার থেকে করার জন্য)
// ==========================================

// ১. নতুন লাইসেন্স বানানো: ?key=NAME&pass=smart123
app.get('/api/admin/create', async (req, res) => {
    if (req.query.pass !== ADMIN_PASS) return res.send("❌ Wrong Password!");
    if (!req.query.key) return res.send("❌ Please provide a key.");
    try {
        const newLicense = new License({ key: req.query.key });
        await newLicense.save();
        res.send(`✅ Success! Key [${req.query.key}] created. Expires in 30 days.`);
    } catch (err) { res.send("❌ Key already exists!"); }
});

// ২. পিসি লক রিসেট করা: ?key=NAME&pass=smart123
app.get('/api/admin/reset', async (req, res) => {
    if (req.query.pass !== ADMIN_PASS) return res.send("❌ Wrong Password!");
    const license = await License.findOne({ key: req.query.key });
    if (!license) return res.send("❌ Key not found!");
    license.registeredDevices = [];
    await license.save();
    res.send(`✅ Success! PC Lock cleared for [${req.query.key}].`);
});

// ৩. মেয়াদ বাড়ানো: ?key=NAME&days=30&pass=smart123
app.get('/api/admin/extend', async (req, res) => {
    if (req.query.pass !== ADMIN_PASS) return res.send("❌ Wrong Password!");
    const days = parseInt(req.query.days) || 30;
    const license = await License.findOne({ key: req.query.key });
    if (!license) return res.send("❌ Key not found!");
    const currentExpiry = license.expiryDate && license.expiryDate > new Date() ? new Date(license.expiryDate) : new Date();
    license.expiryDate = new Date(currentExpiry.getTime() + days * 24 * 60 * 60 * 1000);
    license.isActive = true;
    await license.save();
    res.send(`✅ Success! Added ${days} days to [${req.query.key}].`);
});

// ==========================================
// 🚀 ক্লায়েন্ট API
// ==========================================

app.post('/api/license/authorize', async (req, res) => {
    const { licenseKey, fingerprint } = req.body;
    const license = await License.findOne({ key: licenseKey });
    if (!license || !license.isActive) return res.status(403).json({ ok: false, message: "Invalid or Blocked Key" });
    if (license.expiryDate && new Date() > new Date(license.expiryDate)) return res.status(403).json({ ok: false, message: "Expired!" });
    if (license.registeredDevices.includes(fingerprint)) return res.json({ ok: true });
    if (license.registeredDevices.length < license.maxDevices) {
        license.registeredDevices.push(fingerprint);
        await license.save();
        return res.json({ ok: true });
    }
    return res.status(403).json({ ok: false, message: "Locked to another PC!" });
});

app.post('/api/bundle', async (req, res) => {
    const { licenseKey, fingerprint } = req.body;
    const license = await License.findOne({ key: licenseKey });
    if (license && license.isActive && license.registeredDevices.includes(fingerprint)) {
        try {
            const scriptPath = path.join(__dirname, 'script.js');
            const rawScript = fs.readFileSync(scriptPath, 'utf8');
            res.type('text/plain').send(rawScript);
        } catch (error) { res.status(500).send("console.error('File error');"); }
    } else { res.status(403).send("console.error('Unauthorized');"); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running"));
