import { NextResponse } from "next/server";
import { connect } from "../../../dbConfig/dbConfig";
import FreeMessageQuota from "../../../models/FreeMessageQuota";
import redis from "../../../lib/redis";

connect();

// Helper to generate a consistent Redis key
const getQuotaKey = (senderId, receiverId) => `quota_${senderId}_${receiverId}`;

export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const senderId = searchParams.get('senderId');
    const receiverId = searchParams.get('receiverId');

    if (!senderId || !receiverId) {
        return NextResponse.json({ success: false, error: "Missing parameters" }, { status:400 });
    }

    const cacheKey = getQuotaKey(senderId, receiverId);
    
    // 1. Check Redis first! (Light lightning fast)
    const cachedQuota = await redis.get(cacheKey);
    if (cachedQuota !== null) {
        console.log(`⚡ Serving message quota from Redis for ${senderId}->${receiverId}`);
        return NextResponse.json({ success: true, remainingMessages: parseInt(cachedQuota, 10) });
    }

    // 2. Fallback to Mongo if not in Redis
    console.log(`🐢 Fetching message quota from MongoDB for ${senderId}->${receiverId}`);
    let quota = await FreeMessageQuota.findOne({ senderId, receiverId });

    if (!quota) {
        quota = await FreeMessageQuota.create({ senderId, receiverId, remainingMessages: 5 });
    }
    
    // Save to Redis (cache it for 1 hour of inactivity)
    await redis.set(cacheKey, quota.remainingMessages, 'EX', 3600);

    return NextResponse.json({ success: true, remainingMessages: quota.remainingMessages });
}


export async function POST(req) {
    const body = await req.json();
    const { senderId, receiverId } = body;

    if (!senderId || !receiverId) {
        return NextResponse.json({ success: false, error: "Missing parameters" }, { status: 400 });
    }

    const cacheKey = getQuotaKey(senderId, receiverId);

    // Get current quota from Redis
    let remaining = await redis.get(cacheKey);
    
    // If it expired from Redis, grab it from Mongo again
    if (remaining === null) {
        let quota = await FreeMessageQuota.findOne({ senderId, receiverId });
        if (!quota) {
            quota = await FreeMessageQuota.create({ senderId, receiverId, remainingMessages: 5 });
        }
        remaining = quota.remainingMessages;
    } else {
        remaining = parseInt(remaining, 10);
    }

    // Process the quota deduction
    if (remaining > 0) {
        remaining -= 1;
        
        // 1. Update Redis instantly
        await redis.set(cacheKey, remaining, 'EX', 3600);
        
        // 2. Update Mongo in the background (Fire-and-forget, doesn't block the user!)
        FreeMessageQuota.findOneAndUpdate(
            { senderId, receiverId },
            { remainingMessages: remaining },
            { upsert: true }
        ).catch(err => console.error("Failed to sync quota to Mongo:", err));

        return NextResponse.json({ success: true, remainingMessages: remaining });
    } else {
        return NextResponse.json({ success: false, error: 'No remaining messages' }, { status: 403 });
    }
}