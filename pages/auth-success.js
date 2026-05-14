import { useEffect } from 'react';

export default function AuthSuccess() {
  useEffect(() => {
    try {
      // Walk up the entire opener chain and message everyone
      let target = window.opener;
      while (target) {
        try {
          target.postMessage('discord-auth-success', '*');
          // Also message any iframes inside the opener
          if (target.frames) {
            for (let i = 0; i < target.frames.length; i++) {
              try { target.frames[i].postMessage('discord-auth-success', '*'); } catch(e) {}
            }
          }
        } catch(e) {}
        try { target = target.opener; } catch(e) { break; }
      }
      // Also try top and parent
      try { window.top.postMessage('discord-auth-success', '*'); } catch(e) {}
      try { window.parent.postMessage('discord-auth-success', '*'); } catch(e) {}
    } catch(e) {}

    setTimeout(() => window.close(), 400);
  }, []);

  return (
    <div style={{
      background:'#06080f', color:'#ffffff', minHeight:'100vh',
      display:'flex', flexDirection:'column', alignItems:'center',
      justifyContent:'center', fontFamily:'DM Sans, sans-serif', gap:12
    }}>
      <div style={{fontSize:40}}>✅</div>
      <div style={{fontSize:18, fontWeight:700}}>Logged in!</div>
      <div style={{fontSize:13, color:'rgba(255,255,255,0.5)'}}>Returning to portal...</div>
    </div>
  );
}
