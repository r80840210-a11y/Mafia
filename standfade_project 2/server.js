const express = require('express');
const { PrismaClient } = require('@prisma/client');
const path = require('path');

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint test
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'StandFade Server Running' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
