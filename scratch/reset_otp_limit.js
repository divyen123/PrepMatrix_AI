import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "prepmatrix";

if (!MONGODB_URI) {
  console.error("MONGODB_URI is not set in .env");
  process.exit(1);
}

async function run() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db(MONGODB_DB);
    const email = "divyen624@gmail.com";
    const result = await db.collection("users").updateOne(
      { emailKey: email.toLowerCase() },
      {
        $set: {
          otpRequestCount: 0,
          otpFirstRequestAt: null,
          currentOtp: null,
          otpExpiresAt: null
        }
      }
    );
    console.log(`Success! Modified count: ${result.modifiedCount}`);
  } catch (error) {
    console.error("Error during reset:", error);
  } finally {
    await client.close();
  }
}

run();
