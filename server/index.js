import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import dotenv from "dotenv";
import dns from "node:dns";
import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import nodemailer from "nodemailer";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 8787);
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const LEGACY_OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const GROQ_CHAT_MODEL = process.env.GROQ_CHAT_MODEL || process.env.OPENAI_CHAT_MODEL || "llama-3.1-8b-instant";
const GROQ_TRANSCRIPTION_MODEL = process.env.GROQ_TRANSCRIPTION_MODEL || "whisper-large-v3-turbo";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const MONGODB_DB = process.env.MONGODB_DB || "prepmatrix";
const FRONTEND_URL = process.env.FRONTEND_URL || "";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const SESSION_COOKIE = "prepmatrix_session";

let mongoClient;
let mongoDb;

async function getDb() {
  if (mongoDb) return mongoDb;
  mongoClient = new MongoClient(MONGODB_URI);
  await mongoClient.connect();
  mongoDb = mongoClient.db(MONGODB_DB);
  await Promise.all([
    mongoDb.collection("users").createIndex({ usernameKey: 1 }, { unique: true }),
    mongoDb.collection("users").createIndex({ emailKey: 1 }, { unique: true, partialFilterExpression: { emailKey: { $type: "string" } } }),
    mongoDb.collection("sessions").createIndex({ token: 1 }, { unique: true }),
    mongoDb.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    mongoDb.collection("workspaces").createIndex({ userId: 1 }, { unique: true }),
    mongoDb.collection("notes").createIndex({ userId: 1 }, { unique: true }),
    mongoDb.collection("quizAttempts").createIndex({ userId: 1, createdAt: -1 }),
    mongoDb.collection("chatSessions").createIndex({ userId: 1, updatedAt: -1 }),
  ]);
  console.log(`MongoDB connected: ${MONGODB_URI}/${MONGODB_DB}`);
  return mongoDb;
}

function parseCookies(cookieHeader = "") {
  return cookieHeader.split(";").reduce((cookies, item) => {
    const [rawKey, ...rawValue] = item.trim().split("=");
    if (rawKey) cookies[rawKey] = decodeURIComponent(rawValue.join("="));
    return cookies;
  }, {});
}

function cookieOptions() {
  return IS_PRODUCTION
    ? { httpOnly: true, sameSite: "none", secure: true }
    : { httpOnly: true, sameSite: "lax", secure: false };
}

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    ...cookieOptions(),
    maxAge: 1000 * 60 * 60 * 24 * 7,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash = "") {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const candidate = pbkdf2Sync(password, salt, 120000, 64, "sha512");
  const expected = Buffer.from(hash, "hex");
  return expected.length === candidate.length && timingSafeEqual(candidate, expected);
}

function emailKey(email = "") {
  return email.trim().toLowerCase();
}

function displayNameFromEmail(email = "") {
  return email.split("@")[0] || "Student";
}

function isValidEmail(email = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user._id.toString(),
    username: user.username,
    email: user.email || "",
    institutionName: user.institutionName,
    academicLevel: user.academicLevel,
    academicTrack: user.academicTrack,
    department: user.department || "",
    age: user.age || null,
    schoolType: user.schoolType || (user.academicLevel === "School" ? "school" : "college"),
    grade: user.grade || "",
    degree: user.degree || "",
    createdAt: user.createdAt,
  };
}

function defaultWorkspace(user) {
  return {
    userId: user._id,
    subjects: [],
    schedule: [],
    completed: [],
    academicLevel: user.academicLevel || "College",
    academicTrack: user.academicTrack || "General",
    materialBookmarks: [],
    darkMode: false,
    updatedAt: new Date(),
  };
}

function normalizeWorkspace(doc, user) {
  return {
    subjects: doc?.subjects || [],
    schedule: doc?.schedule || [],
    completed: doc?.completed || [],
    academicLevel: doc?.academicLevel || user?.academicLevel || "College",
    academicTrack: doc?.academicTrack || user?.academicTrack || "General",
    materialBookmarks: doc?.materialBookmarks || [],
    darkMode: Boolean(doc?.darkMode),
  };
}
async function createSession(userId) {
  const db = await getDb();
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
  await db.collection("sessions").insertOne({ token, userId, createdAt: new Date(), expiresAt });
  return token;
}

async function getAuthenticatedUser(req) {
  let token = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(" ");
    if (parts.length === 2 && parts[0] === "Bearer") {
      token = parts[1];
    }
  }
  if (!token) return null;
  const db = await getDb();
  const session = await db.collection("sessions").findOne({ token, expiresAt: { $gt: new Date() } });
  if (!session) return null;
  return db.collection("users").findOne({ _id: session.userId });
}

async function sendOtpEmail(toEmail, otp) {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    throw new Error("SMTP credentials (SMTP_USER and SMTP_PASS) are not configured in .env file.");
  }

  let resolvedIp = host;
  if (!/^[0-9.]+$/.test(host)) {
    try {
      resolvedIp = await new Promise((resolve, reject) => {
        dns.lookup(host, { family: 4 }, (err, address) => {
          if (err) return reject(err);
          resolve(address);
        });
      });
    } catch (dnsErr) {
      console.warn(`DNS lookup failed for ${host}:`, dnsErr);
    }
  }

  const transporter = nodemailer.createTransport({
    host: resolvedIp,
    port,
    secure,
    auth: {
      user,
      pass,
    },
    tls: {
      servername: host,
      rejectUnauthorized: false
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });

  const mailOptions = {
    from: `"PrepMatrix AI" <${user}>`,
    to: toEmail,
    subject: "PrepMatrix AI OTP Code",
    text: `Your security verification OTP code is: ${otp}. It will expire in 10 minutes.`,
    html: `<div style="font-family: sans-serif; padding: 20px; max-width: 500px; border: 1px solid #eaeaea; border-radius: 8px;">
      <h2>PrepMatrix AI Security Code</h2>
      <p>A request was made to update your credentials using forgot password OTP verification.</p>
      <p>Your security verification code is:</p>
      <div style="background: #f4f5f6; padding: 14px; font-size: 1.5rem; font-weight: bold; letter-spacing: 2px; text-align: center; border-radius: 6px; color: #0a0f1c; margin: 20px 0;">
        ${otp}
      </div>
      <p>This code will expire in 10 minutes. If you did not request this, please change your password immediately.</p>
    </div>`,
  };

  await transporter.sendMail(mailOptions);
}

async function sendEmailViaResend(toEmail, otp, apiKey) {
  const url = "https://api.resend.com/emails";
  const body = {
    from: "PrepMatrix AI <onboarding@resend.dev>",
    to: toEmail,
    subject: "PrepMatrix AI OTP Code",
    html: `<div style="font-family: sans-serif; padding: 20px; max-width: 500px; border: 1px solid #eaeaea; border-radius: 8px;">
      <h2>PrepMatrix AI Security Code</h2>
      <p>A request was made to update your credentials using forgot password OTP verification.</p>
      <p>Your security verification code is:</p>
      <div style="background: #f4f5f6; padding: 14px; font-size: 1.5rem; font-weight: bold; letter-spacing: 2px; text-align: center; border-radius: 6px; color: #0a0f1c; margin: 20px 0;">
        ${otp}
      </div>
      <p>This code will expire in 2 minutes. If you did not request this, please change your password immediately.</p>
    </div>`,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Resend API failed: ${response.status} - ${errText}`);
  }
}

function requireAuth(handler) {
  return async (req, res) => {
    try {
      const user = await getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ error: "Login required." });
      req.user = user;
      return handler(req, res);
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : "Server error." });
    }
  };
}


function clampQuizLimit(value) {
  return Number(value) >= 10 ? 10 : 5;
}

function stripJsonFences(content = "") {
  return content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function parseQuizJson(content = "") {
  const cleaned = stripJsonFences(content);
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("AI response did not contain valid quiz JSON.");
  }
}

function normalizeGeneratedQuestions(rawQuestions, limit) {
  if (!Array.isArray(rawQuestions)) {
    throw new Error("AI response did not include a questions array.");
  }

  const questions = rawQuestions.slice(0, limit).map((item, index) => {
    const options = Array.isArray(item?.options)
      ? item.options.map((option) => String(option || "").trim()).filter(Boolean).slice(0, 4)
      : [];
    const answerIndex = Number(item?.answerIndex);

    if (!String(item?.question || "").trim() || options.length !== 4 || answerIndex < 0 || answerIndex > 3) {
      throw new Error("AI response included an invalid quiz question.");
    }

    return {
      id: `ai-${Date.now()}-${index}`,
      question: String(item.question).trim(),
      options,
      answerIndex,
      explanation: String(item?.explanation || "Review the correct option and compare it with the topic concept.").trim(),
    };
  });

  if (questions.length !== limit) {
    throw new Error(`AI generated ${questions.length} questions, expected ${limit}.`);
  }

  return questions;
}
function getGroqConfigStatus() {
  if (GROQ_API_KEY) {
    return { available: true, apiKey: GROQ_API_KEY, message: "Groq API key configured.", keySource: "GROQ_API_KEY" };
  }
  if (LEGACY_OPENAI_API_KEY) {
    const looksLikeOpenAIKey = LEGACY_OPENAI_API_KEY.startsWith("sk-");
    return {
      available: false,
      apiKey: null,
      message: looksLikeOpenAIKey
        ? "An OpenAI key was found in OPENAI_API_KEY. Groq requires a GROQ_API_KEY from https://console.groq.com/keys."
        : "OPENAI_API_KEY is set, but Groq uses GROQ_API_KEY. Move your Groq key into GROQ_API_KEY.",
      keySource: "OPENAI_API_KEY",
    };
  }
  return { available: false, apiKey: null, message: "GROQ_API_KEY is not configured on the server.", keySource: null };
}

// CORS: allow Vercel frontend in production
const allowedOrigins = FRONTEND_URL ? FRONTEND_URL.split(",").map(o => o.trim()) : [];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. same-origin, Postman) or matching origins
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: "25mb" }));

app.get("/api/database/status", async (_req, res) => {
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    res.json({ available: true, database: MONGODB_DB, uri: MONGODB_URI });
  } catch (error) {
    res.status(500).json({ available: false, error: error instanceof Error ? error.message : "MongoDB connection failed." });
  }
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const { email = "", password = "", institutionName = "", academicLevel = "College", academicTrack = "General", department = "" } = req.body ?? {};
    if (!email.trim() || !password.trim() || !institutionName.trim()) {
      return res.status(400).json({ error: "Email, password, and institution name are required." });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }
    const db = await getDb();
    const userDoc = {
      username: displayNameFromEmail(email),
      usernameKey: emailKey(email),
      email: email.trim(),
      emailKey: emailKey(email),
      passwordHash: hashPassword(password),
      institutionName: institutionName.trim(),
      academicLevel,
      academicTrack,
      department: academicLevel === "College" ? department : "",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await db.collection("users").insertOne(userDoc);
    const user = { ...userDoc, _id: result.insertedId };
    await db.collection("workspaces").insertOne(defaultWorkspace(user));
    await db.collection("notes").insertOne({ userId: user._id, notes: [], updatedAt: new Date() });
    const token = await createSession(user._id);
    setSessionCookie(res, token);
    return res.status(201).json({ token, user: sanitizeUser(user), workspace: normalizeWorkspace(null, user) });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: "A user with this email already exists." });
    return res.status(500).json({ error: error instanceof Error ? error.message : "Registration failed." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email = "", password = "" } = req.body ?? {};
    const db = await getDb();
    const user = await db.collection("users").findOne({ $or: [{ emailKey: emailKey(email) }, { usernameKey: emailKey(email) }] });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: "Email or password is incorrect." });
    }
    const token = await createSession(user._id);
    setSessionCookie(res, token);
    const workspace = await db.collection("workspaces").findOne({ userId: user._id });
    return res.json({ token, user: sanitizeUser(user), workspace: normalizeWorkspace(workspace, user) });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Login failed." });
  }
});
app.post("/api/auth/logout", requireAuth(async (req, res) => {
  const db = await getDb();
  const token = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
  if (token) await db.collection("sessions").deleteOne({ token });
  clearSessionCookie(res);
  res.json({ ok: true });
}));

app.delete("/api/auth/account", requireAuth(async (req, res) => {
  const { password = "" } = req.body ?? {};
  if (!password.trim()) {
    return res.status(400).json({ error: "Password is required to delete your account." });
  }

  const db = await getDb();
  const userId = req.user._id;

  // Verify the password against stored hash
  if (!verifyPassword(password, req.user.passwordHash)) {
    return res.status(401).json({ error: "Incorrect password. Account was not deleted." });
  }

  await Promise.all([
    db.collection("workspaces").deleteMany({ userId }),
    db.collection("notes").deleteMany({ userId }),
    db.collection("quizAttempts").deleteMany({ userId }),
    db.collection("worktrees").deleteMany({ userId }),
    db.collection("chatSessions").deleteMany({ userId }),
    db.collection("sessions").deleteMany({ userId }),
    db.collection("users").deleteOne({ _id: userId }),
  ]);

  clearSessionCookie(res);
  res.json({ ok: true });
}));

app.get("/api/auth/me", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: "Login required." });
    const db = await getDb();
    const workspace = await db.collection("workspaces").findOne({ userId: user._id });
    
    let token = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(" ");
      if (parts.length === 2 && parts[0] === "Bearer") {
        token = parts[1];
      }
    }
    
    return res.json({ token, user: sanitizeUser(user), workspace: normalizeWorkspace(workspace, user) });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Could not load profile." });
  }
});

app.post("/api/auth/send-otp", requireAuth(async (req, res) => {
  try {
    const db = await getDb();
    const user = await db.collection("users").findOne({ _id: req.user._id });
    
    const now = new Date();
    const WINDOW_DURATION = 24 * 60 * 60 * 1000; // 24 hours
    const MAX_REQUESTS = 5;

    let otpRequestCount = user.otpRequestCount || 0;
    let otpFirstRequestAt = user.otpFirstRequestAt ? new Date(user.otpFirstRequestAt) : null;

    if (otpFirstRequestAt && (now.getTime() - otpFirstRequestAt.getTime() < WINDOW_DURATION)) {
      if (otpRequestCount >= MAX_REQUESTS) {
        const timeRemaining = WINDOW_DURATION - (now.getTime() - otpFirstRequestAt.getTime());
        const hours = Math.floor(timeRemaining / (60 * 60 * 1000));
        const minutes = Math.floor((timeRemaining % (60 * 60 * 1000)) / (60 * 1000));
        return res.status(429).json({
          error: `Too many OTP requests. Limit is 5 per 24 hours. Please try again in ${hours} hour(s) and ${minutes} minute(s).`
        });
      }
      otpRequestCount += 1;
    } else {
      otpFirstRequestAt = now;
      otpRequestCount = 1;
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    await db.collection("users").updateOne(
      { _id: req.user._id },
      { 
        $set: { 
          currentOtp: otp, 
          otpExpiresAt: new Date(now.getTime() + 2 * 60 * 1000),
          otpRequestCount,
          otpFirstRequestAt
        } 
      }
    );
    console.log(`[OTP Verification] Code for ${req.user.email}: ${otp} (Request ${otpRequestCount}/${MAX_REQUESTS} in window)`);

    try {
      if (process.env.RESEND_API_KEY) {
        await sendEmailViaResend(req.user.email, otp, process.env.RESEND_API_KEY);
      } else {
        await sendOtpEmail(req.user.email, otp);
      }
      return res.json({ success: true, email: req.user.email, requestCount: otpRequestCount });
    } catch (mailError) {
      console.error("Email dispatch failed:", mailError);
      return res.status(500).json({ error: `Could not send email: ${mailError.message}. Please configure SMTP or Resend credentials in your .env/Render settings.` });
    }
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to send OTP." });
  }
}));

app.post("/api/auth/verify-otp", requireAuth(async (req, res) => {
  try {
    const { otp } = req.body ?? {};
    if (!otp) return res.status(400).json({ error: "OTP code is required." });
    
    const db = await getDb();
    const user = await db.collection("users").findOne({ _id: req.user._id });
    
    if (!user.currentOtp || user.currentOtp !== otp.trim()) {
      return res.status(400).json({ error: "Invalid OTP code." });
    }
    
    if (user.otpExpiresAt && new Date() > new Date(user.otpExpiresAt)) {
      return res.status(400).json({ error: "OTP code has expired." });
    }
    
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Verification failed." });
  }
}));

app.put("/api/auth/profile", requireAuth(async (req, res) => {
  try {
    const {
      username,
      email,
      password,
      confirmPassword,
      currentPassword,
      otp,
      age,
      schoolType,
      institutionName,
      academicLevel,
      academicTrack,
      department,
      grade,
      degree
    } = req.body ?? {};

    const db = await getDb();
    const update = {};

    if (username) update.username = username.trim();

    if (email && email.trim() !== req.user.email) {
      if (!isValidEmail(email)) {
        return res.status(400).json({ error: "Enter a valid email address." });
      }
      const existingUser = await db.collection("users").findOne({ emailKey: emailKey(email) });
      if (existingUser) {
        return res.status(400).json({ error: "A user with this email already exists." });
      }
      update.email = email.trim();
      update.emailKey = emailKey(email);
    }

    if (password) {
      if (otp) {
        if (!req.user.currentOtp || req.user.currentOtp !== otp) {
          return res.status(400).json({ error: "Invalid OTP code." });
        }
        if (req.user.otpExpiresAt && new Date() > new Date(req.user.otpExpiresAt)) {
          return res.status(400).json({ error: "OTP code has expired." });
        }
        update.currentOtp = null;
        update.otpExpiresAt = null;
        update.otpRequestCount = 0;
        update.otpFirstRequestAt = null;
      } else {
        if (!currentPassword) {
          return res.status(400).json({ error: "Current password is required to set a new password." });
        }
        if (!verifyPassword(currentPassword, req.user.passwordHash)) {
          return res.status(401).json({ error: "Current password is incorrect." });
        }
      }
      if (password !== confirmPassword) {
        return res.status(400).json({ error: "Passwords do not match." });
      }
      if (password.length < 4) {
        return res.status(400).json({ error: "Password must be at least 4 characters long." });
      }
      update.passwordHash = hashPassword(password);
    }

    if (age !== undefined) update.age = age === null ? null : Number(age);
    if (schoolType) update.schoolType = schoolType;
    if (institutionName) update.institutionName = institutionName.trim();
    if (academicLevel) update.academicLevel = academicLevel;
    if (academicTrack) update.academicTrack = academicTrack;
    if (department !== undefined) update.department = department;
    if (grade !== undefined) update.grade = grade;
    if (degree !== undefined) update.degree = degree;

    update.updatedAt = new Date();

    await db.collection("users").updateOne(
      { _id: req.user._id },
      { $set: update }
    );

    const updatedUser = await db.collection("users").findOne({ _id: req.user._id });
    res.json({ user: sanitizeUser(updatedUser) });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Profile update failed." });
  }
}));

app.put("/api/workspace", requireAuth(async (req, res) => {
  const db = await getDb();
  const allowed = ["subjects", "schedule", "completed", "academicLevel", "academicTrack", "materialBookmarks", "darkMode"];
  const update = allowed.reduce((next, key) => {
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, key)) next[key] = req.body[key];
    return next;
  }, { updatedAt: new Date() });
  await db.collection("workspaces").updateOne(
    { userId: req.user._id },
    { $set: update, $setOnInsert: { userId: req.user._id } },
    { upsert: true }
  );
  const workspace = await db.collection("workspaces").findOne({ userId: req.user._id });
  res.json({ workspace: normalizeWorkspace(workspace, req.user) });
}));

app.post("/api/workspace/import", requireAuth(async (req, res) => {
  try {
    const db = await getDb();
    const allowed = ["subjects", "schedule", "completed", "academicLevel", "academicTrack", "materialBookmarks", "darkMode"];
    const update = allowed.reduce((next, key) => {
      if (Object.prototype.hasOwnProperty.call(req.body ?? {}, key)) next[key] = req.body[key];
      return next;
    }, { updatedAt: new Date() });
    await db.collection("workspaces").updateOne(
      { userId: req.user._id },
      { $set: update, $setOnInsert: { userId: req.user._id } },
      { upsert: true }
    );
    const workspace = await db.collection("workspaces").findOne({ userId: req.user._id });
    res.json({ workspace: normalizeWorkspace(workspace, req.user) });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Workspace import failed." });
  }
}));

app.get("/api/notes", requireAuth(async (req, res) => {
  const db = await getDb();
  const doc = await db.collection("notes").findOne({ userId: req.user._id });
  res.json({ notes: doc?.notes || [] });
}));

app.put("/api/notes", requireAuth(async (req, res) => {
  const db = await getDb();
  const notes = Array.isArray(req.body?.notes) ? req.body.notes : [];
  await db.collection("notes").updateOne(
    { userId: req.user._id },
    { $set: { notes, updatedAt: new Date() }, $setOnInsert: { userId: req.user._id } },
    { upsert: true }
  );
  res.json({ notes });
}));

app.get("/api/worktrees", requireAuth(async (req, res) => {
  try {
    const db = await getDb();
    const list = await db.collection("worktrees")
      .find({ userId: req.user._id })
      .sort({ updatedAt: -1 })
      .toArray();
    res.json({
      worktrees: list.map(({ _id, ...wt }) => ({
        id: _id.toString(),
        ...wt,
        userId: wt.userId.toString()
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}));

app.post("/api/worktrees", requireAuth(async (req, res) => {
  try {
    const db = await getDb();
    const { name, nodes } = req.body;
    if (!name || !Array.isArray(nodes)) {
      return res.status(400).json({ error: "Missing name or nodes" });
    }
    const doc = {
      userId: req.user._id,
      name,
      nodes,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await db.collection("worktrees").insertOne(doc);
    res.status(201).json({
      id: result.insertedId.toString(),
      name,
      nodes,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}));

app.put("/api/worktrees/:id", requireAuth(async (req, res) => {
  try {
    const db = await getDb();
    const { name, nodes } = req.body;
    if (!name || !Array.isArray(nodes)) {
      return res.status(400).json({ error: "Missing name or nodes" });
    }
    const result = await db.collection("worktrees").updateOne(
      { _id: new ObjectId(req.params.id), userId: req.user._id },
      { $set: { name, nodes, updatedAt: new Date() } }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Worktree not found" });
    }
    res.json({ id: req.params.id, name, nodes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}));

app.delete("/api/worktrees/:id", requireAuth(async (req, res) => {
  try {
    const db = await getDb();
    const result = await db.collection("worktrees").deleteOne({
      _id: new ObjectId(req.params.id),
      userId: req.user._id
    });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Worktree not found" });
    }
    res.json({ success: true, id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}));

app.get("/api/quizzes", requireAuth(async (req, res) => {
  const db = await getDb();
  const attempts = await db.collection("quizAttempts").find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50).toArray();
  res.json({ attempts: attempts.map(({ _id, ...attempt }) => {
    delete attempt.userId;
    return { id: _id.toString(), ...attempt };
  }) });
}));



app.delete("/api/quizzes", requireAuth(async (req, res) => {
  const db = await getDb();
  const result = await db.collection("quizAttempts").deleteMany({ userId: req.user._id });
  res.json({ ok: true, deletedCount: result.deletedCount });
}));
app.post("/api/quizzes/generate", requireAuth(async (req, res) => {
  const config = getGroqConfigStatus();
  if (!config.available) return res.status(500).json({ error: config.message });

  const topic = String(req.body?.topic || "").trim();
  const subjectName = String(req.body?.subjectName || "General study").trim();
  const academicLevel = String(req.body?.academicLevel || req.user.academicLevel || "College").trim();
  const academicTrack = String(req.body?.academicTrack || req.user.academicTrack || "General").trim();
  const department = String(req.body?.department || req.user.department || "").trim();
  const limit = clampQuizLimit(req.body?.limit);

  if (!topic) {
    return res.status(400).json({ error: "Enter a topic before generating the quiz." });
  }

  const audience = academicLevel === "College" && department
    ? `${department} college students`
    : `${academicLevel} students`;

  const prompt = [
    `Topic: ${topic}`,
    `Subject: ${subjectName}`,
    `Audience: ${audience}`,
    `Board/stream: ${academicTrack}`,
    `Question count: ${limit}`,
    "Generate multiple-choice questions that test the real academic content of the topic.",
    "Do not ask about PrepMatrix, planner features, revision strategy, study scheduling, or the app itself.",
    "Use level-appropriate difficulty and include actual concepts, definitions, algorithms, formulas, steps, examples, or applications from the topic.",
    "Return only valid JSON in this exact shape:",
    "{\"questions\":[{\"question\":\"...\",\"options\":[\"...\",\"...\",\"...\",\"...\"],\"answerIndex\":0,\"explanation\":\"...\"}]}"
  ].join("\n");

  const baseBody = {
    model: GROQ_CHAT_MODEL,
    temperature: 0.15,
    max_tokens: limit === 10 ? 3600 : 2200,
    messages: [
      {
        role: "system",
        content: "You are a precise academic quiz generator. Return only JSON. The quiz must be about the requested academic topic, never about the app or study planner.",
      },
      { role: "user", content: prompt },
    ],
  };

  async function requestGroqQuiz(body) {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  }

  let { response, payload } = await requestGroqQuiz({
    ...baseBody,
    response_format: { type: "json_object" },
  });

  if (!response.ok && payload?.error?.code === "failed_generation") {
    ({ response, payload } = await requestGroqQuiz(baseBody));
  }

  if (!response.ok) {
    return res.status(response.status).json({ error: payload?.error?.message || "Groq quiz generation failed." });
  }

  const content = payload?.choices?.[0]?.message?.content || "";
  const parsed = parseQuizJson(content);
  const questions = normalizeGeneratedQuestions(parsed.questions, limit);

  return res.json({ questions, limit, model: GROQ_CHAT_MODEL, topic, subjectName });
}));
app.post("/api/quizzes", requireAuth(async (req, res) => {
  const db = await getDb();
  const attempt = {
    userId: req.user._id,
    academicLevel: req.body?.academicLevel || req.user.academicLevel,
    academicTrack: req.body?.academicTrack || req.user.academicTrack,
    department: req.body?.department || req.user.department || "",
    subjectName: req.body?.subjectName || "General study",
    topic: req.body?.topic || "General revision",
    total: Number(req.body?.total || 0),
    score: Number(req.body?.score || 0),
    createdAt: new Date(),
  };
  const result = await db.collection("quizAttempts").insertOne(attempt);
  const safeAttempt = { ...attempt };
  delete safeAttempt.userId;
  res.status(201).json({ attempt: { id: result.insertedId.toString(), ...safeAttempt } });
}));

app.get("/api/voice-assistant/status", (_req, res) => {
  const config = getGroqConfigStatus();
  res.json({ available: config.available, model: GROQ_TRANSCRIPTION_MODEL, message: config.message, keySource: config.keySource });
});

app.get("/api/study-assistant/status", (_req, res) => {
  const config = getGroqConfigStatus();
  res.json({ available: config.available, model: GROQ_CHAT_MODEL, message: config.message, keySource: config.keySource });
});

app.post("/api/voice-assistant/transcribe", async (req, res) => {
  try {
    const config = getGroqConfigStatus();
    if (!config.available) return res.status(500).json({ error: config.message });
    const { audio, mimeType = "audio/webm", language = "en", prompt = "" } = req.body ?? {};
    if (!audio) return res.status(400).json({ error: "Audio payload is required." });
    const buffer = Buffer.from(audio, "base64");
    if (!buffer.length) return res.status(400).json({ error: "Audio payload could not be decoded." });
    const extension = mimeType.includes("wav") ? "wav" : mimeType.includes("mp4") ? "mp4" : mimeType.includes("mpeg") ? "mp3" : "webm";
    const file = new File([buffer], `voice-command.${extension}`, { type: mimeType });
    const formData = new FormData();
    formData.append("file", file);
    formData.append("model", GROQ_TRANSCRIPTION_MODEL);
    formData.append("language", language);
    formData.append("response_format", "verbose_json");
    formData.append("temperature", "0");
    if (prompt) formData.append("prompt", prompt);
    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: formData,
    });
    const payload = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: payload?.error?.message || "Groq transcription request failed." });
    return res.json({ text: payload.text || "", duration: payload.duration ?? null, language: payload.language || language, segments: payload.segments || [] });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Unexpected transcription error." });
  }
});
// Chat History Endpoints
app.get("/api/chat-sessions", requireAuth(async (req, res) => {
  const db = await getDb();
  const sessions = await db.collection("chatSessions")
    .find({ userId: req.user._id })
    .project({ _id: 1, title: 1, createdAt: 1, updatedAt: 1 })
    .sort({ updatedAt: -1 })
    .toArray();
  res.json({ sessions });
}));

app.get("/api/chat-sessions/:id", requireAuth(async (req, res) => {
  try {
    const db = await getDb();
    const session = await db.collection("chatSessions").findOne({
      _id: new ObjectId(req.params.id),
      userId: req.user._id
    });
    if (!session) return res.status(404).json({ error: "Chat session not found." });
    res.json({ session });
  } catch (error) {
    res.status(400).json({ error: "Invalid session ID." });
  }
}));

app.post("/api/chat-sessions", requireAuth(async (req, res) => {
  try {
    const db = await getDb();
    const { title = "New Chat", messages = [] } = req.body ?? {};
    const newSession = {
      userId: req.user._id,
      title: title.trim().substring(0, 100),
      messages,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const result = await db.collection("chatSessions").insertOne(newSession);
    res.status(201).json({
      session: {
        id: result.insertedId.toString(),
        ...newSession,
        userId: undefined
      }
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create chat session." });
  }
}));

app.put("/api/chat-sessions/:id", requireAuth(async (req, res) => {
  try {
    const db = await getDb();
    const { title = "" } = req.body ?? {};
    if (!title.trim()) return res.status(400).json({ error: "Title is required." });
    const result = await db.collection("chatSessions").updateOne(
      { _id: new ObjectId(req.params.id), userId: req.user._id },
      { $set: { title: title.trim().substring(0, 100), updatedAt: new Date() } }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Chat session not found or unauthorized." });
    }
    res.json({ message: "Chat session updated successfully." });
  } catch (error) {
    res.status(400).json({ error: "Invalid session ID." });
  }
}));

app.delete("/api/chat-sessions/:id", requireAuth(async (req, res) => {
  try {
    const db = await getDb();
    const result = await db.collection("chatSessions").deleteOne({
      _id: new ObjectId(req.params.id),
      userId: req.user._id
    });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Chat session not found or unauthorized." });
    }
    res.json({ message: "Chat session deleted successfully." });
  } catch (error) {
    res.status(400).json({ error: "Invalid session ID." });
  }
}));

app.post("/api/study-assistant/chat", requireAuth(async (req, res) => {
  try {
    const config = getGroqConfigStatus();
    if (!config.available) return res.status(500).json({ error: config.message });
    const { message = "", sessionId = null, plannerContext = {} } = req.body ?? {};
    if (!message.trim()) return res.status(400).json({ error: "Message is required." });
    const db = await getDb();
    let session = null;
    let isNewSession = false;
    if (sessionId) {
      try {
        session = await db.collection("chatSessions").findOne({
          _id: new ObjectId(sessionId),
          userId: req.user._id
        });
      } catch (e) {
        // invalid ObjectId
      }
    }
    if (!session) {
      isNewSession = true;
      const newSession = {
        userId: req.user._id,
        title: message.trim().substring(0, 40) || "New Chat",
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const result = await db.collection("chatSessions").insertOne(newSession);
      session = { ...newSession, _id: result.insertedId };
    }
    const contextSummary = [
      `Academic level: ${plannerContext.academicLevel || "College"}`,
      `Board or stream: ${plannerContext.academicTrack || "General"}`,
      `Total tasks: ${plannerContext.totalTasks ?? 0}`,
      `Completed tasks: ${plannerContext.completedTasks ?? 0}`,
      `Remaining tasks: ${plannerContext.remainingTasks ?? 0}`,
      `Completion rate: ${plannerContext.completionRate ?? 0}%`,
      `Weak subject: ${plannerContext.weakSubject || "Unknown"}`,
      `Next pending task: ${plannerContext.firstPendingTask || "None"}`,
      `Today's tasks: ${(plannerContext.todayTasks || []).join(", ") || "None"}`,
      `Subject breakdown: ${plannerContext.subjectBreakdown?.length ? plannerContext.subjectBreakdown.join("; ") : "No subject breakdown available"}`,
    ].join("\n");
    const safeHistory = (session.messages || [])
      .filter((item) => item && typeof item.text === "string" && typeof item.role === "string" && (item.role === "user" || item.role === "assistant"))
      .slice(-8)
      .map((item) => ({ role: item.role, content: item.text }));
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GROQ_CHAT_MODEL,
        temperature: 0.6,
        max_tokens: 1024,
        messages: [
          {
            role: "system",
            content: "You are an AI study planner assistant. Give concise, practical, encouraging answers. Use the planner context accurately. Adapt explanations, resource suggestions, and study strategy to the academic level. Prefer actionable guidance over generic motivation. If the user asks about study status, refer to the provided planner data rather than inventing numbers. IMPORTANT: Always structure lists, key topics, steps, and points using clean bullet points (* Item) or numbered lists (1. Item) on new lines, with proper line breaks between points for pointwise readability. Never write lists inline as a single paragraph.",
          },
          { role: "system", content: `Current planner context:\n${contextSummary}` },
          ...safeHistory,
          { role: "user", content: message.trim() },
        ],
      }),
    });
    const payload = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: payload?.error?.message || "Groq chat request failed." });
    const outputText = payload?.choices?.[0]?.message?.content?.trim() || "";
    const userMessageId = `user-${Date.now()}`;
    const assistantMessageId = `assistant-${Date.now()}`;
    const userMsg = { id: userMessageId, role: "user", text: message.trim(), createdAt: new Date() };
    const assistantMsg = { id: assistantMessageId, role: "assistant", text: outputText, createdAt: new Date() };
    const updatedMessages = [...(session.messages || []), userMsg, assistantMsg];
    let titleUpdate = {};
    if (session.title === "New Chat" || isNewSession) {
      const generatedTitle = message.trim().substring(0, 40) + (message.trim().length > 40 ? "..." : "");
      titleUpdate = { title: generatedTitle };
    }
    await db.collection("chatSessions").updateOne(
      { _id: session._id },
      {
        $set: {
          messages: updatedMessages,
          updatedAt: new Date(),
          ...titleUpdate
        }
      }
    );
    return res.json({
      reply: outputText,
      model: GROQ_CHAT_MODEL,
      sessionId: session._id.toString(),
      sessionTitle: titleUpdate.title || session.title
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Unexpected chat error." });
  }
}));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static assets from Vite build in production
app.use(express.static(path.join(__dirname, "../dist")));

// SPA Router fallback: serve index.html for all non-API paths
app.get("/{*splat}", (req, res, next) => {
  if (req.path.startsWith("/api")) {
    return next();
  }
  res.sendFile(path.join(__dirname, "../dist/index.html"));
});

app.listen(PORT, async () => {
  console.log(`PrepMatrix server listening on http://localhost:${PORT}`);
  try {
    await getDb();
  } catch (error) {
    console.warn(error instanceof Error ? error.message : "MongoDB connection failed.");
  }
});









