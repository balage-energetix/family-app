import { useEffect, useState, useRef, useCallback } from 'react';
import { Peer } from 'peerjs';

export const useFamilySync = (roomId, userId, roleIndex) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [messages, setMessages] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [connected, setConnected] = useState(false);
  const [peerNames, setPeerNames] = useState({});
  
  const peerRef = useRef(null);
  const connectionsRef = useRef({}); // peerId -> connection
  const callsRef = useRef({}); // peerId -> call

  const addRemoteStream = useCallback((peerId, stream) => {
    setRemoteStreams(prev => {
      if (prev.find(s => s.id === peerId)) return prev;
      return [...prev, { id: peerId, stream }];
    });
  }, []);

  const setupDataConnection = useCallback((conn) => {
    if (connectionsRef.current[conn.peer]?.open) return;
    connectionsRef.current[conn.peer] = conn;
    
    conn.on('open', () => {
      conn.send({ type: 'identity', name: userId });
    });

    conn.on('data', (data) => {
      if (data.type === 'identity') {
        setPeerNames(prev => ({ ...prev, [conn.peer]: data.name }));
      } else if (data.type === 'chat') {
        // Prevent duplicate messages by checking a simple hash/id if needed, 
        // but with fix roles, duplicates are naturally avoided.
        setMessages(prev => [...prev, { ...data, timestamp: Date.now(), id: Math.random() }]);
      } else if (data.type === 'reaction') {
        setReactions(prev => [...prev, { ...data, id: Math.random() }]);
      }
    });

    conn.on('close', () => {
      delete connectionsRef.current[conn.peer];
      setRemoteStreams(prev => prev.filter(s => s.id !== conn.peer));
    });
  }, [userId]);

  useEffect(() => {
    if (!roomId || !roleIndex) return;

    const myPeerId = `${roomId}-member-${roleIndex}`;
    const peer = new Peer(myPeerId);
    peerRef.current = peer;

    const initMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setLocalStream(stream);
        
        peer.on('open', () => {
          setConnected(true);
          
          // Try to connect to the other 2 roles
          const otherRoles = [1, 2, 3].filter(r => r !== roleIndex);
          otherRoles.forEach(r => {
            const otherPeerId = `${roomId}-member-${r}`;
            
            // Connect for Data
            const conn = peer.connect(otherPeerId);
            setupDataConnection(conn);

            // Connect for Video
            const call = peer.call(otherPeerId, stream);
            call.on('stream', (remoteStream) => {
              addRemoteStream(otherPeerId, remoteStream);
              callsRef.current[otherPeerId] = call;
            });
          });
        });

        peer.on('call', (call) => {
          call.answer(stream);
          call.on('stream', (remoteStream) => {
            addRemoteStream(call.peer, remoteStream);
            callsRef.current[call.peer] = call;
          });
        });

        peer.on('connection', (conn) => setupDataConnection(conn));
      } catch (err) {
        console.error('Media error', err);
      }
    };

    initMedia();

    return () => {
      peer.destroy();
      localStream?.getTracks().forEach(t => t.stop());
    };
  }, [roomId, roleIndex, setupDataConnection, addRemoteStream]);

  const sendMessage = (text) => {
    const msg = { type: 'chat', sender: userId, text, msgId: Math.random() };
    // Send only to UNIQUE open connections
    const uniqueConns = Object.values(connectionsRef.current).filter(c => c.open);
    uniqueConns.forEach(conn => conn.send(msg));
    setMessages(prev => [...prev, { ...msg, timestamp: Date.now() }]);
  };

  const sendReaction = (emoji) => {
    const reaction = { type: 'reaction', emoji, sender: userId };
    Object.values(connectionsRef.current).forEach(conn => {
      if (conn.open) conn.send(reaction);
    });
    setReactions(prev => [...prev, { ...reaction, id: Math.random() }]);
  };

  return {
    localStream,
    remoteStreams,
    messages,
    reactions,
    connected,
    peerNames,
    sendMessage,
    sendReaction
  };
};
