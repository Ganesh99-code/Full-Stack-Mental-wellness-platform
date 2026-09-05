'use client';

import { useEffect, useContext } from 'react';
import { UserContext } from '../context/UserContext';
import io from 'socket.io-client';
import { usePathname } from 'next/navigation';

export default function GlobalNotification() {
  const { user } = useContext(UserContext);
  const pathname = usePathname();

  useEffect(() => {
    // Request notification permission on mount
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
      }
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    const socket = io({
      path: '/api/socket',
    });

    // Join personal room so we can receive directed messages
    socket.emit('join', user.id);

    socket.on('receiveMessage', (newMsg) => {
      // Prevent notifying if they are actively looking at the chat dashboard
      if (pathname === '/myChats') return; 
      
      if (newMsg.receiverId === user.id) {
        if (typeof window !== 'undefined' && 'Notification' in window) {
          if (Notification.permission === 'granted') {
            new Notification(`New message from ${newMsg.sender}`, {
              body: newMsg.text,
            });
          }
        }
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [user, pathname]);

  return null; // This component doesn't render anything visually
}
