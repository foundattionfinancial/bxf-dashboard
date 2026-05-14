import { useEffect } from 'react';

export default function AuthSuccess() {
  useEffect(() => {
    try {
      localStorage.setItem('discord-auth-success', Date.now().toString());
    } catch(e) {}
    try { window.opener?.postMessage('discord-auth-success', '*'); } catch(e) {}
    try { window.parent?.postMessage('discord-auth-success', '*'); } catch(e) {}
    try { window.top?.postMessage('discord-auth-success', '*'); } catch(e) {}
    setTimeout(() => {
      window.close();
      setTimeout(() => { window.location.href = '/dashboard'; }, 500);
    }, 500);
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
