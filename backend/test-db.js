require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testConn() {
  try {
    console.log('Testing connection to:', process.env.DATABASE_URL);
    const count = await prisma.reservation.count();
    console.log('Success! Reservation count:', count);
  } catch (err) {
    console.error('Connection failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

testConn();
