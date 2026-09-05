import { NextResponse } from "next/server";
import ChatContact from "../../../models/ChatContact";
import User from "../../../models/User";
import redis from '../../../lib/redis';
import { connect } from "../../../dbConfig/dbConfig";

connect();

export async function POST(req) {
    const { senderId, receiverId } = await req.json();

    try {
        await ChatContact.findOneAndUpdate(
            { user : senderId },
            { $addToSet : { contacts: receiverId}},
            { upsert : true, new : true}
        );
        await ChatContact.findOneAndUpdate(
            { user : receiverId },
            { $addToSet : { contacts: senderId}},
            { upsert : true, new : true}
        );

        // INVALIDATE REDIS CACHE because contacts have changed!
        await redis.del(`mychats_${senderId}`);
        await redis.del(`mychats_${receiverId}`);

        return NextResponse.json({ success : true });
    } catch (err) {
        console.log(err);
        return NextResponse.json({
            success : false,
            message : "Failed to update contacts"
        });
    }
}

export async function GET (req) {
    const userId = req.nextUrl.searchParams.get("userId");

    if (!userId) {
        return NextResponse.json({ success: false, message: "Missing userId"});
    }

    try {
        // --- REDIS CACHING ---
        const cacheKey = `mychats_${userId}`;
        const cachedContacts = await redis.get(cacheKey);
        
        if (cachedContacts) {
            console.log(`⚡ Serving contacts from Redis cache for user ${userId}`);
            return NextResponse.json({
                success: true, 
                contacts: JSON.parse(cachedContacts)
            });
        }
        
        console.log(`🐢 Fetching contacts from MongoDB for user ${userId}`);
        const chatContact = await ChatContact.findOne({ user: userId })
                                .populate('contacts', 'name image _id');
                                
        const contacts = chatContact?.contacts || [];
        
        // Save to Redis cache for 5 minutes
        await redis.set(cacheKey, JSON.stringify(contacts), 'EX', 300);

        return NextResponse.json({
            success: true, 
            contacts: contacts
        });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ success: false, message: "Failed to fetch contacts" });
    }
}