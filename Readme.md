# 📦 TeachFlow Backend

This is the backend for **TeachFlow**, an educational web application where students can enroll in courses, teachers can publish classes, and admins manage platform operations. The backend is built with **Express.js**, **MongoDB**, **JWT authentication**, and **Firebase Admin SDK**.

> Deployed on **Vercel**

---
## 📂 Repositories

- **Frontend GitHub Repo:** [https://github.com/khan-fardin/teach-flow-server](https://github.com/khan-fardin/teach-flow-server)

---

## ⚙️ Tech Stack

- **Node.js**
- **Express.js**
- **MongoDB + Mongoose**
- **Firebase Admin SDK** (Token Verification)
- **JWT Authentication**
- **Vercel** for deployment
- **CORS, dotenv, and Morgan** for enhanced API features

---

## ✅ Features

- 🔐 JWT + Firebase Admin Token Authentication
- 📚 Add / Approve / List Classes
- 🧑‍🏫 Teacher Role Applications
- 👨‍🎓 Student Class Enrollment + Reviews
- 📝 Assignment Submission
- 📊 Admin Dashboard Data: Users, Classes, Reviews
- 🚫 Role-based Route Protection

---

## 📮 API Routes Overview

| Method | Route                     | Description                         |
|--------|---------------------------|-------------------------------------|
| GET    | `/classes/approved`       | List all approved classes           |
| POST   | `/auth/token`             | Generate JWT token                  |
| POST   | `/feedback`               | Submit feedback for a class         |
| POST   | `/enroll`                 | Enroll in a class                   |
| PATCH  | `/classes/status/:id`     | Admin approves/rejects a class      |
| GET    | `/admin/stats`            | Get overall admin dashboard stats   |

> And many more endpoints for users, roles, assignments, reviews, etc.

---

## 🔐 Security Notes

- Firebase tokens are validated server-side.
- All sensitive environment variables are kept in `.env`.
- Rate-limiting & IP restrictions can be added for production.

---
