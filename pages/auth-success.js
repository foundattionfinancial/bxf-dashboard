import { useEffect } from 'react';

export default function AuthSuccess() {
  useEffect(() => {
    const sendAndClose = () => {
      try {
        // Try to message the opener (popup parent)
        if (window.opener) {
          window.opener.postMessage('discord-auth-success', '*');
        }
        // Also try parent (iframe)
        if (window.parent && window.parent !== window) {
          window.parent.postMessage('discord-auth-success', '*');
        }
        // Also broadcast to top
        if (window.top && window.top !== window) {
          window.top.postMessage('discord-auth-success', '*');
        }
      } catch(e) {}
      
      // Close after short delay
      setTimeout(() => {
        window.close();
        // If window.close didn't work, redirect to dashboard
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 500);
      }, 300);
    };

    sendAndClose();
  }, []);

  return (
    <div style={{
      background:'#06080f', color:'#ffffff', minHeight:'100vh',
      display:'flex', flexDirection:'column', alignItems:'center',
      justifyContent:'center', fontFamily:'DM Sans, sans-serif', gap:12,
      textAlign:'center', padding:20
    }}>
      <div style={{fontSize:40}}>✅</div>
      <div style={{fontSize:18, fontWeight:700}}>Logged in!</div>
      <div style={{fontSize:13, color:'rgba(255,255,255,0.5)'}}>Closing and returning to portal...</div>
    </div>
  );
}
