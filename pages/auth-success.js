import { useEffect } from 'react';

export default function AuthSuccess() {
  useEffect(() => {
    // Tell parent iframe to reload
    if (window.opener) {
      window.opener.postMessage('discord-auth-success', '*');
      setTimeout(() => window.close(), 800);
    } else {
      // Not a popup, redirect to dashboard
      window.location.href = '/dashboard';
    }
  }, []);

  return (
    <div style={{
      background:'#06080f', color:'#ffffff', minHeight:'100vh',
      display:'flex', flexDirection:'column', alignItems:'center', 
      justifyContent:'center', fontFamily:'DM Sans, sans-serif', gap:12
    }}>
      <div style={{fontSize:32}}>✅</div>
      <div style={{fontSize:16, fontWeight:600}}>Logged in successfully</div>
      <div style={{fontSize:13, color:'rgba(255,255,255,0.5)'}}>You can close this tab</div>
    </div>
  );
}
