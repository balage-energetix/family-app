import { useEffect, useState, useRef, useCallback } from 'react';
import { Peer } from 'peerjs';

export const useFamilySync = (roomId, userId) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [messages, setMessages] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [connected, setConnected] = useState(false);
  const [activeSlot, setActiveSlot] = useState(null);
  const [peerNames, setPeerNames] = useState({});
  
  const peerRef = useRef(null);
  const connectionsRef = useRef({}); 
  const callsRef = useRef({});
  const intervalRef = useRef(null);

  const startDiscovery = useCallback((peer, stream, mySlot) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    
    intervalRef.current = setInterval(() => {
      if (!peer || peer.destroyed) return;
      
      for (let i = 1; i <= 12; i++) {
        if (i === mySlot) continue;
        const otherId = `${roomId}-v3-slot-${i}`;
        
        // Data connection attempt
        if (!connectionsRef.current[otherId] || !connectionsRef.current[otherId].open) {
          const conn = peer.connect(otherId, { reliable: true });
          conn.on('open', () => setupDataConnection(conn));
        }

        // Call attempt
        if (!callsRef.current[otherId] && stream) {
          const call = peer.call(otherId, stream);
          call.on('stream', (remoteStream) => {
            addRemoteStream(otherId, remoteStream);
            callsRef.current[otherId] = call;
          });
          call.on('error', () => delete callsRef.current[otherId]);
        }
      }
    }, 3000);
  }, [roomId]);

  const initPeer = useCallback(async () => {
    if (!roomId) return;
    
    // Cleanup previous
    peerRef.current?.destroy();
    setRemoteStreams([]);
    setConnected(false);

    let stream = localStream;
    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: 1280, height: 720 }, 
          audio: { echoCancellation: true, noiseSuppression: true } 
        });
        setLocalStream(stream);
      } catch (err) {
        console.error('Media error', err);
      }
    }

    // Try slots 1-12
    for (let i = 1; i <= 12; i++) {
      const potentialId = `${roomId}-v3-slot-${i}`;
      const peer = new Peer(potentialId);
      
      const success = await new Promise((resolve) => {
        peer.on('open', () => resolve(true));
        peer.on('error', (err) => {
          if (err.type === 'unavailable-id') resolve(false);
          else resolve(true);
        });
        setTimeout(() => resolve(false), 5000);
      });

      if (success) {
        peerRef.current = peer;
        setActiveSlot(i);
        setConnected(true);
        
        peer.on('call', (call) => {
          call.answer(stream);
          call.on('stream', (remoteStream) => {
            addRemoteStream(call.peer, remoteStream);
            callsRef.current[call.peer] = call;
          });
        });

        peer.on('connection', (conn) => setupDataConnection(conn));
        peer.on('disconnected', () => peer.reconnect());
        
        startDiscovery(peer, stream, i);
        break;
      } else {
        peer.destroy();
      }
    }
  }, [roomId, localStream, startDiscovery]);

  useEffect(() => {
    initPeer();
    return () => {
      peerRef.current?.destroy();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [roomId, initPeer]);

  const addRemoteStream = (peerId, stream) => {
    setRemoteStreams(prev => {
      if (prev.find(s => s.id === peerId)) return prev;
      return [...prev, { id: peerId, stream }];
    });
  };

  const setupDataConnection = (conn) => {
    if (connectionsRef.current[conn.peer]?.open) return;
    connectionsRef.current[conn.peer] = conn;
    
    conn.on('open', () => {
      conn.send({ type: 'identity', name: userId });
    });

    conn.on('data', (data) => {
      if (data.type === 'identity') {
        setPeerNames(prev => ({ ...prev, [conn.peer]: data.name }));
      } else if (data.type === 'chat') {
        setMessages(prev => [...prev, { ...data, timestamp: Date.now() }]);
      } else if (data.type === 'reaction') {
        setReactions(prev => [...prev, { ...data, id: Math.random(), timestamp: Date.now() }]);
      }
    });

    conn.on('close', () => delete connectionsRef.current[conn.peer]);
  };

  const sendMessage = (text) => {
    const msg = { type: 'chat', sender: userId, text };
    Object.values(connectionsRef.current).forEach(conn => {
      if (conn.open) conn.send(msg);
    });
    setMessages(prev => [...prev, { ...msg, timestamp: Date.now() }]);
  };

  const sendReaction = (emoji) => {
    const reaction = { type: 'reaction', emoji, sender: userId };
    Object.values(connectionsRef.current).forEach(conn => {
      if (conn.open) conn.send(reaction);
    });
    setReactions(prev => [...prev, { ...reaction, id: Math.random(), timestamp: Date.now() }]);
  };

  return {
    localStream,
    remoteStreams,
    messages,
    reactions,
    connected,
    activeSlot,
    peerNames,
    sendMessage,
    sendReaction,
    reconnect: initPeer
  };
};
