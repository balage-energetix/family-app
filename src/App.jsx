import React, { useState, useEffect, useRef } from 'react';
import { 
  Video, VideoOff, Mic, MicOff, Send, PhoneOff, 
  Users, MessageSquare, Heart, ThumbsUp, Laugh, Hand, X
} from 'lucide-react';
import { useFamilySync } from './hooks/useFamilySync';
import './index.css';

const VideoTile = ({ stream, label, isLocal }) => {
  const videoRef = useRef();

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="video-tile glass">
      <video ref={videoRef} autoPlay playsInline muted={isLocal} />
      <div className="video-info">
        {isLocal ? <Video size={14} /> : <Users size={14} />}
        <span>{label}</span>
      </div>
    </div>
  );
};

function App() {
  const [inCall, setInCall] = useState(false);
  const [roomId, setRoomId] = useState('csaladi-kor');
  const [userId, setUserId] = useState('');
  const [inputText, setInputText] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [showChat, setShowChat] = useState(false);

  const { 
    localStream, remoteStreams, messages, reactions, 
    connected, sendMessage, sendReaction 
  } = useFamilySync(inCall ? roomId : null, userId);

  const handleJoin = () => {
    if (userId.trim() && roomId.trim()) setInCall(true);
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (inputText.trim()) {
      sendMessage(inputText);
      setInputText('');
    }
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(t => t.enabled = isMuted);
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(t => t.enabled = isVideoOff);
      setIsVideoOff(!isVideoOff);
    }
  };

  if (!inCall) {
    return (
      <div className="join-screen">
        <div className="join-card glass">
          <div className="logo" style={{ justifyContent: 'center', marginBottom: '24px' }}>
            <Video size={32} /> FamilyConnect
          </div>
          <h2 style={{ marginBottom: '8px' }}>Üdvözlünk!</h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
            Lépj be a közös szobába.
          </p>
          <input 
            type="text" 
            className="chat-input" 
            placeholder="A te neved" 
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            style={{ width: '100%', marginBottom: '12px' }}
          />
          <input 
            type="text" 
            className="chat-input" 
            placeholder="Szoba neve" 
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            style={{ width: '100%' }}
          />
          <button className="join-btn" onClick={handleJoin}>Belépés</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="header glass">
        <div className="logo">
          <Video size={20} /> FamilyConnect
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button 
            className={`control-btn ${showChat ? 'active' : ''}`} 
            style={{ width: '36px', height: '36px' }}
            onClick={() => setShowChat(!showChat)}
          >
            <MessageSquare size={18} />
          </button>
          <span style={{ fontSize: '0.7rem', color: connected ? '#4ade80' : '#f87171' }}>
            ● {connected ? 'Online' : '...'}
          </span>
        </div>
      </header>

      <main className="main-content">
        <div className="video-grid">
          {localStream && <VideoTile stream={localStream} label={`${userId} (Te)`} isLocal={true} />}
          {remoteStreams.map(rs => (
            <VideoTile key={rs.id} stream={rs.stream} label="Résztvevő" />
          ))}
          {remoteStreams.length === 0 && (
            <div className="glass" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Várakozás a többiekre... <br/>
              <span style={{ fontSize: '0.7rem' }}>Szoba: {roomId}</span>
            </div>
          )}
        </div>

        <aside className={`chat-panel glass ${showChat ? 'active' : ''}`}>
          <div className="header" style={{ height: '48px', borderBottom: '1px solid var(--glass-border)', padding: '0 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MessageSquare size={16} /> Csevegés
            </div>
            <button className="control-btn" style={{ width: '32px', height: '32px' }} onClick={() => setShowChat(false)}>
              <X size={16} />
            </button>
          </div>
          <div className="chat-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`message ${msg.sender === userId ? 'sent' : 'received'}`}>
                <div style={{ fontSize: '0.7rem', opacity: 0.7, marginBottom: '2px' }}>{msg.sender}</div>
                {msg.text}
              </div>
            ))}
          </div>
          <form className="chat-input-area" onSubmit={handleSendMessage}>
            <input 
              type="text" 
              className="chat-input" 
              placeholder="Üzenet..." 
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            <button type="submit" className="control-btn active" style={{ width: '34px', height: '34px' }}>
              <Send size={14} />
            </button>
          </form>
        </aside>
      </main>

      <div className="controls-bar glass">
        <button className={`control-btn ${isMuted ? 'danger' : 'active'}`} onClick={toggleMute}>
          {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
        <button className={`control-btn ${isVideoOff ? 'danger' : 'active'}`} onClick={toggleVideo}>
          {isVideoOff ? <VideoOff size={18} /> : <Video size={18} />}
        </button>
        <div style={{ width: '1px', background: 'var(--glass-border)', margin: '0 4px' }} />
        <button className="control-btn" onClick={() => sendReaction('❤️')}><Heart size={18} color="#fb7185" /></button>
        <button className="control-btn" onClick={() => sendReaction('👍')}><ThumbsUp size={18} color="#60a5fa" /></button>
        <button className="control-btn" onClick={() => sendReaction('😂')}><Laugh size={18} color="#fbbf24" /></button>
        <button className="control-btn" onClick={() => sendReaction('👋')}><Hand size={18} color="#c084fc" /></button>
        <div style={{ width: '1px', background: 'var(--glass-border)', margin: '0 4px' }} />
        <button className="control-btn danger" onClick={() => window.location.reload()}>
          <PhoneOff size={18} />
        </button>
      </div>

      {reactions.map(r => (
        <div key={r.id} className="emoji-burst" style={{ left: `${Math.random() * 80 + 10}%`, bottom: '100px' }}>
          {r.emoji}
        </div>
      ))}
    </div>
  );
}

export default App;
