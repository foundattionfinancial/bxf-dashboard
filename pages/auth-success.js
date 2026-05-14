export default function AuthSuccess() {
  if (typeof window !== 'undefined') {
    window.opener?.postMessage('discord-auth-success', '*');
    setTimeout(() => window.close(), 500);
  }
  return (
    <div style={{
      background:'#06080f', color:'#ffffff', minHeight:'100vh',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontFamily:'DM Sans, sans-serif', fontSize:16
    }}>
      ✅ Logged in — you can close this tab.
    </div>
  );
}
