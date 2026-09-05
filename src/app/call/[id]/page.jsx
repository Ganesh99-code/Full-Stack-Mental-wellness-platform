"use client";

import { useContext, useEffect, useState } from 'react';
import { UserContext } from '../../../context/UserContext';
import { useParams, useRouter } from 'next/navigation';
import VideoCall from '../../../components/VideoCall';

export default function CallPage() {
    const { id: callId } = useParams();
    const { user } = useContext(UserContext);
    const router = useRouter();
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
        if (!user) {
            router.push('/login');
        }
    }, [user, router]);

    if (!isClient) return null; // Prevent hydration errors

    if (!user) {
        return (
            <div className="min-h-screen flex items-center justify-center pt-20">
                <p className="text-gray-600">Redirecting to login...</p>
            </div>
        );
    }

    if (!callId) {
        return (
            <div className="min-h-screen flex items-center justify-center pt-20">
                <p className="text-red-500">Invalid Call ID.</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen pt-24 bg-gray-50 flex flex-col items-center">
            <h1 className="text-3xl font-bold mb-8 text-gray-800">Live Video Session</h1>
            
            <VideoCall callId={callId} user={user} />
        </div>
    );
}
