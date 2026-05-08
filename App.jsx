import { useState, useEffect, useRef, useCallback } from "react";

// ─── Firebase Realtime Database REST API (no SDK needed) ──────────────────────
const FIREBASE_URL = "https://lantam-cyril-default-rtdb.firebaseio.com";

const fbGet = async (path) => {
  try {
    const r = await fetch(`${FIREBASE_URL}/${path}.json`);
    return r.ok ? await r.json() : null;
  } catch { return null; }
};

const fbSet = async (path, data) => {
  try {
    await fetch(`${FIREBASE_URL}/${path}.json`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch {}
};

// ─── localStorage (same-device fallback + session storage) ───────────────────
const LS = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(`sn_${k}`)); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(`sn_${k}`, JSON.stringify(v)); } catch {} },
  del: (k) => { try { localStorage.removeItem(`sn_${k}`); } catch {} },
};

const ROLES = { FATHER: "father", SON: "son" };
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 14);

// ─── Radar Canvas ─────────────────────────────────────────────────────────────
function Radar({ sonLoc, sonOnline, sonName }) {
  const ref = useRef(null);
  const live = useRef({ angle: 0, sonLoc, sonOnline, sonName });
  useEffect(() => { live.current = { ...live.current, sonLoc, sonOnline, sonName }; }, [sonLoc, sonOnline, sonName]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;

    const resize = () => {
      const p = canvas.parentElement.getBoundingClientRect();
      canvas.width = p.width * devicePixelRatio;
      canvas.height = p.height * devicePixelRatio;
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const { angle, sonLoc, sonOnline, sonName } = live.current;
      const W = canvas.width, H = canvas.height, dpr = devicePixelRatio;
      const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.4;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#030a10"; ctx.fillRect(0, 0, W, H);

      // Rings
      [1, 0.75, 0.5, 0.25].forEach((f, i) => {
        ctx.beginPath(); ctx.arc(cx, cy, R * f, 0, Math.PI * 2);
        ctx.strokeStyle = i === 0 ? "#14532d" : "#071a0f"; ctx.lineWidth = i === 0 ? 1.5 : 1; ctx.stroke();
      });
      // Cross
      const lines = [[cx-R,cy,cx+R,cy],[cx,cy-R,cx,cy+R],[cx-R*.707,cy-R*.707,cx+R*.707,cy+R*.707],[cx+R*.707,cy-R*.707,cx-R*.707,cy+R*.707]];
      ctx.strokeStyle = "#071a0f"; ctx.lineWidth = 1;
      lines.forEach(([x1,y1,x2,y2]) => { ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); });

      // Sweep
      if (sonOnline) {
        ctx.save(); ctx.translate(cx,cy); ctx.rotate(live.current.angle);
        live.current.angle += 0.022;
        const g = ctx.createLinearGradient(0,0,R,0);
        g.addColorStop(0,"rgba(74,222,128,0.38)"); g.addColorStop(0.65,"rgba(74,222,128,0.08)"); g.addColorStop(1,"rgba(74,222,128,0)");
        ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,R,-0.44,0.44); ctx.closePath();
        ctx.fillStyle = g; ctx.fill(); ctx.restore();
      }

      ctx.save(); ctx.beginPath(); ctx.arc(cx,cy,R-1,0,Math.PI*2); ctx.clip();

      // Father
      ctx.beginPath(); ctx.arc(cx,cy,7*dpr,0,Math.PI*2); ctx.fillStyle="#f59e0b"; ctx.fill();
      ctx.beginPath(); ctx.arc(cx,cy,13*dpr,0,Math.PI*2); ctx.strokeStyle="#f59e0b50"; ctx.lineWidth=2; ctx.stroke();

      // Son
      if (sonOnline && sonLoc) {
        const px = cx + sonLoc.x * R * 0.6, py = cy + sonLoc.y * R * 0.6;
        const p = (Math.sin(Date.now()/350)+1)/2;
        ctx.setLineDash([3*dpr,5*dpr]);
        ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(px,py); ctx.strokeStyle="#60a5fa20"; ctx.lineWidth=1.5; ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(px,py,(11+p*7)*dpr,0,Math.PI*2); ctx.strokeStyle=`rgba(96,165,250,${0.5-p*0.3})`; ctx.lineWidth=2; ctx.stroke();
        ctx.beginPath(); ctx.arc(px,py,8*dpr,0,Math.PI*2); ctx.fillStyle="#60a5fa"; ctx.fill();
        ctx.fillStyle="#93c5fd"; ctx.font=`bold ${10*dpr}px DM Mono,monospace`; ctx.textAlign="center";
        ctx.fillText((sonName||"SON").toUpperCase(), px, py+22*dpr);
      }
      ctx.restore();

      // Labels
      ctx.fillStyle="#f59e0b80"; ctx.font=`bold ${9*dpr}px DM Mono,monospace`; ctx.textAlign="center"; ctx.fillText("YOU",cx,cy+22*dpr);
      ctx.fillStyle="#14532d"; ctx.font=`${9*dpr}px DM Mono,monospace`;
      ctx.fillText("N",cx,cy-R-8*dpr); ctx.fillText("S",cx,cy+R+16*dpr);
      ctx.textAlign="left"; ctx.fillText("E",cx+R+6*dpr,cy+4*dpr);
      ctx.textAlign="right"; ctx.fillText("W",cx-R-4*dpr,cy+4*dpr);

      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  return <canvas ref={ref} style={{ width:"100%", height:"100%", display:"block" }} />;
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
function Auth({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [role, setRole] = useState(ROLES.FATHER);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr("");
    if (!name.trim()||!pass.trim()||!code.trim()) { setErr("Fill in all fields."); return; }
    if (pass.length < 4) { setErr("Password needs 4+ characters."); return; }
    setBusy(true);
    const room = slug(code);

    // Load users from Firebase, fallback to LS
    let users = await fbGet(`sn/${room}/users`) || LS.get(`${room}_u`) || {};

    if (mode === "register") {
      if (Object.values(users).find(u => u.role === role)) { setErr(`A ${role} is already registered in this family.`); setBusy(false); return; }
      if (users[slug(name)]) { setErr("Name already taken in this family."); setBusy(false); return; }
      const u = { name: name.trim(), role, pass, at: Date.now() };
      users[slug(name)] = u;
      await fbSet(`sn/${room}/users`, users);
      LS.set(`${room}_u`, users);
      const sess = { name: u.name, role, room };
      LS.set("sess", sess); onAuth(sess);
    } else {
      const local = LS.get(`${room}_u`) || {};
      const all = { ...local, ...users };
      const u = all[slug(name)];
      if (!u) { setErr("Account not found — register first."); setBusy(false); return; }
      if (u.pass !== pass) { setErr("Wrong password."); setBusy(false); return; }
      const sess = { name: u.name, role: u.role, room };
      LS.set("sess", sess); onAuth(sess);
    }
    setBusy(false);
  };

  const C = {
    page: { minHeight:"100vh", background:"#050c14", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Sans',sans-serif", padding:"20px" },
    box: { width:"100%", maxWidth:"390px", background:"linear-gradient(155deg,#0a1a24,#060f18)", border:"1px solid #0d3a2a", borderRadius:"24px", padding:"36px 30px", boxShadow:"0 0 80px #4ade8008" },
    logo: { display:"flex", alignItems:"center", gap:"10px", justifyContent:"center", marginBottom:"6px" },
    icon: { width:"42px", height:"42px", background:"linear-gradient(135deg,#4ade80,#22d3ee)", borderRadius:"12px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"20px" },
    title: { fontSize:"22px", fontWeight:"900", background:"linear-gradient(135deg,#4ade80,#22d3ee)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" },
    sub: { textAlign:"center", color:"#0d4a2a", fontSize:"10px", fontWeight:"800", letterSpacing:"3px", marginBottom:"26px" },
    tabs: { display:"flex", background:"#030a10", borderRadius:"11px", padding:"4px", marginBottom:"20px", border:"1px solid #0d3a2a" },
    tab: (a) => ({ flex:1, padding:"10px", borderRadius:"8px", border:"none", fontFamily:"inherit", fontWeight:"700", fontSize:"13px", cursor:"pointer", transition:"all 0.18s", background:a?"linear-gradient(135deg,#4ade80,#22d3ee)":"transparent", color:a?"#050c14":"#14532d" }),
    lbl: { fontSize:"10px", fontWeight:"800", color:"#0d4a2a", letterSpacing:"2px", textTransform:"uppercase", marginBottom:"6px", display:"block" },
    inp: { width:"100%", background:"#030a10", border:"1px solid #0d3a2a", borderRadius:"10px", color:"#e2e8f0", padding:"11px 14px", fontSize:"14px", outline:"none", fontFamily:"inherit", marginBottom:"13px" },
    roles: { display:"flex", gap:"10px", marginBottom:"13px" },
    roleBtn: (a,c) => ({ flex:1, padding:"13px 8px", borderRadius:"11px", border:`2px solid ${a?c:"#0d3a2a"}`, background:a?c+"18":"transparent", color:a?c:"#14532d", fontWeight:"800", fontSize:"14px", cursor:"pointer", fontFamily:"inherit", transition:"all 0.18s", display:"flex", flexDirection:"column", alignItems:"center", gap:"3px" }),
    hint: { fontSize:"11px", color:"#0a3a1a", marginBottom:"13px", lineHeight:"1.6", padding:"9px 12px", background:"#030a10", borderRadius:"8px", border:"1px solid #0a2a14" },
    btn: { width:"100%", padding:"13px", background:busy?"#0a2a14":"linear-gradient(135deg,#4ade80,#22d3ee)", border:"none", borderRadius:"11px", color:busy?"#14532d":"#050c14", fontWeight:"900", fontSize:"14px", cursor:busy?"default":"pointer", fontFamily:"inherit", marginTop:"2px" },
    errBox: { background:"#ef444415", border:"1px solid #ef444440", borderRadius:"9px", color:"#f87171", fontSize:"12px", fontWeight:"600", padding:"9px 13px", marginBottom:"12px" },
    sw: { textAlign:"center", marginTop:"16px", fontSize:"13px", color:"#14532d" },
    swBtn: { background:"none", border:"none", color:"#4ade80", fontWeight:"800", cursor:"pointer", fontFamily:"inherit", fontSize:"13px" },
  };

  return (
    <div style={C.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=DM+Mono:wght@500;700&display=swap'); *{box-sizing:border-box} input:focus{border-color:#4ade80!important;box-shadow:0 0 0 3px #4ade8015!important;outline:none}`}</style>
      <div style={C.box}>
        <div style={C.logo}><div style={C.icon}>🛡️</div><span style={C.title}>SafeNest</span></div>
        <div style={C.sub}>FAMILY LOCATION SHARING</div>
        <div style={C.tabs}>
          <button style={C.tab(mode==="login")} onClick={()=>{setMode("login");setErr("");}}>Log In</button>
          <button style={C.tab(mode==="register")} onClick={()=>{setMode("register");setErr("");}}>Register</button>
        </div>
        {mode==="register"&&<>
          <span style={C.lbl}>I am the</span>
          <div style={C.roles}>
            <button style={C.roleBtn(role===ROLES.FATHER,"#f59e0b")} onClick={()=>setRole(ROLES.FATHER)}><span style={{fontSize:"22px"}}>👨</span>Father</button>
            <button style={C.roleBtn(role===ROLES.SON,"#60a5fa")} onClick={()=>setRole(ROLES.SON)}><span style={{fontSize:"22px"}}>👦</span>Son</button>
          </div>
        </>}
        <span style={C.lbl}>Family Code</span>
        <input style={C.inp} placeholder='e.g. "smithfamily"' value={code} onChange={e=>setCode(e.target.value)} />
        <div style={C.hint}>📌 Both father and son must enter the <strong style={{color:"#4ade80"}}>same Family Code</strong> — this is how your phones connect across the internet.</div>
        <span style={C.lbl}>Your Name</span>
        <input style={C.inp} placeholder="Enter your name" value={name} onChange={e=>setName(e.target.value)} />
        <span style={C.lbl}>Password</span>
        <input style={C.inp} type="password" placeholder="Min 4 characters" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} />
        {err&&<div style={C.errBox}>⚠️ {err}</div>}
        <button style={C.btn} onClick={submit} disabled={busy}>{busy?"Please wait…":mode==="register"?"Create Account →":"Log In →"}</button>
        <div style={C.sw}>{mode==="login"?"No account? ":"Already registered? "}<button style={C.swBtn} onClick={()=>{setMode(mode==="login"?"register":"login");setErr("");}}>{mode==="login"?"Register":"Log In"}</button></div>
      </div>
    </div>
  );
}

// ─── SON ──────────────────────────────────────────────────────────────────────
function Son({ user, onLogout }) {
  const [sharing, setSharing] = useState(false);
  const [pending, setPending] = useState(false);
  const [coords, setCoords] = useState(null);
  const watchId = useRef(null);
  const simTimer = useRef(null);
  const simCoords = useRef(null);
  const activeRef = useRef(false);

  const push = useCallback(async (loc) => {
    const d = { ...loc, online: true, name: user.name, t: Date.now() };
    LS.set(`${user.room}_loc`, d);
    await fbSet(`sn/${user.room}/loc`, d);
  }, [user]);

  const stopAll = useCallback(() => {
    activeRef.current = false;
    if (watchId.current != null) { navigator.geolocation?.clearWatch(watchId.current); watchId.current = null; }
    if (simTimer.current) { clearInterval(simTimer.current); simTimer.current = null; }
    const off = { online: false, name: user.name, t: Date.now() };
    LS.set(`${user.room}_loc`, off);
    fbSet(`sn/${user.room}/loc`, off);
    setSharing(false); setPending(false); setCoords(null);
  }, [user]);

  const startSim = useCallback(() => {
    const base = { lat: 40.7580 + (Math.random()-.5)*.02, lng: -73.9855 + (Math.random()-.5)*.02, accuracy: 18 };
    simCoords.current = { ...base };
    setCoords({ ...base });
    push(base);
    setSharing(true); setPending(false); activeRef.current = true;
    simTimer.current = setInterval(() => {
      if (!activeRef.current) return;
      simCoords.current.lat += (Math.random()-.48)*.0004;
      simCoords.current.lng += (Math.random()-.48)*.0004;
      const next = { ...simCoords.current };
      setCoords({ ...next });
      push(next);
    }, 4000);
  }, [push]);

  const toggle = useCallback(() => {
    if (sharing || pending) { stopAll(); return; }

    setPending(true);

    if (!navigator.geolocation) { startSim(); return; }

    // Fallback timeout — if browser hangs on permission prompt
    const fallback = setTimeout(() => { if (!activeRef.current) startSim(); }, 7000);

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        clearTimeout(fallback);
        if (watchId.current == null) return; // was cancelled
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) };
        setCoords(loc); push(loc);
        if (!activeRef.current) { activeRef.current = true; setSharing(true); setPending(false); }
      },
      () => { clearTimeout(fallback); startSim(); },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
  }, [sharing, pending, stopAll, startSim]);

  useEffect(() => () => stopAll(), [stopAll]);

  const C = {
    page: { minHeight:"100vh", background:"#050c14", fontFamily:"'DM Sans',sans-serif", color:"#e2e8f0", display:"flex", flexDirection:"column" },
    hdr: { background:"#060f18", borderBottom:"1px solid #0d3a2a", padding:"0 20px", height:"56px", display:"flex", alignItems:"center", justifyContent:"space-between" },
    logoWrap: { display:"flex", alignItems:"center", gap:"8px" },
    logoIco: { width:"28px", height:"28px", background:"linear-gradient(135deg,#4ade80,#22d3ee)", borderRadius:"7px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"14px" },
    logoTxt: { fontSize:"16px", fontWeight:"900", background:"linear-gradient(135deg,#4ade80,#22d3ee)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" },
    outBtn: { background:"transparent", border:"1px solid #0d3a2a", borderRadius:"7px", color:"#14532d", fontSize:"11px", fontWeight:"700", padding:"5px 11px", cursor:"pointer", fontFamily:"inherit" },
    main: { flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"28px 20px", gap:"22px" },
    hi: { textAlign:"center" },
    hiName: { fontSize:"26px", fontWeight:"900", color:"#60a5fa" },
    hiSub: { fontSize:"12px", color:"#14532d", marginTop:"4px", fontWeight:"600" },
    card: { width:"100%", maxWidth:"320px", background:"linear-gradient(155deg,#0a1a24,#060f18)", border:`2px solid ${sharing?"#4ade80":pending?"#fbbf24":"#0d3a2a"}`, borderRadius:"24px", padding:"32px 22px", display:"flex", flexDirection:"column", alignItems:"center", gap:"18px", boxShadow:sharing?"0 0 60px #4ade8014":"none", transition:"all 0.35s" },
    bigBtn: { width:"128px", height:"128px", borderRadius:"50%", border:`3px solid ${sharing?"#4ade80":pending?"#fbbf24":"#0d3a2a"}`, background:sharing?"radial-gradient(circle at 40% 40%,#4ade8028,#050c14)":pending?"radial-gradient(circle,#fbbf2412,#050c14)":"#060f18", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", cursor:pending?"default":"pointer", transition:"all 0.3s", boxShadow:sharing?"0 0 48px #4ade8032":"none", fontSize:"44px", gap:"2px", userSelect:"none", WebkitTapHighlightColor:"transparent" },
    btnLbl: { fontSize:"9px", fontWeight:"900", color:sharing?"#4ade80":pending?"#fbbf24":"#0d4a2a", letterSpacing:"2px" },
    statusTxt: { fontSize:"17px", fontWeight:"900", color:sharing?"#4ade80":pending?"#fbbf24":"#14532d" },
    statusSub: { fontSize:"12px", color:sharing?"#4ade8090":"#14532d", fontWeight:"600", textAlign:"center" },
    coords: { width:"100%", background:"#030a10", border:"1px solid #0d3a2a", borderRadius:"11px", padding:"13px", fontFamily:"'DM Mono',monospace", fontSize:"11px", color:"#0d4a2a", display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px", lineHeight:"1.6" },
    coordVal: { color:"#4ade80", fontWeight:"700" },
    room: { background:"#0a2a14", borderRadius:"7px", padding:"5px 12px", fontSize:"10px", color:"#14532d", fontFamily:"'DM Mono',monospace", fontWeight:"700" },
  };

  return (
    <div style={C.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800;900&family=DM+Mono:wght@500;700&display=swap'); *{box-sizing:border-box} @keyframes spin{to{transform:rotate(360deg)}} @keyframes glow{0%,100%{box-shadow:0 0 30px #4ade8030}50%{box-shadow:0 0 58px #4ade8060}}`}</style>
      <header style={C.hdr}>
        <div style={C.logoWrap}><div style={C.logoIco}>🛡️</div><span style={C.logoTxt}>SafeNest</span></div>
        <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
          <span style={{fontSize:"11px",color:"#60a5fa",fontWeight:"800"}}>👦 Son</span>
          <button style={C.outBtn} onClick={onLogout}>Log Out</button>
        </div>
      </header>
      <main style={C.main}>
        <div style={C.hi}><div style={C.hiName}>Hey, {user.name} 👋</div><div style={C.hiSub}>Tap to share your location with Dad</div></div>
        <div style={C.card}>
          <div style={C.bigBtn} onClick={toggle}>
            <span style={{animation:pending?"spin 1s linear infinite":sharing?"glow 2s infinite":"none",display:"inline-block"}}>
              {sharing?"📡":pending?"⏳":"📴"}
            </span>
            <span style={C.btnLbl}>{sharing?"LIVE":pending?"WAIT":"OFF"}</span>
          </div>
          <div style={C.statusTxt}>{sharing?"✅ Sharing Live":pending?"⏳ Starting…":"Location Off"}</div>
          <div style={C.statusSub}>{sharing?"Dad can see you right now":pending?"Requesting access…":"Tap the button above to go live"}</div>
          {coords&&sharing&&(
            <div style={C.coords}>
              <div><div>LAT</div><div style={C.coordVal}>{coords.lat.toFixed(5)}</div></div>
              <div><div>LNG</div><div style={C.coordVal}>{coords.lng.toFixed(5)}</div></div>
              <div><div>ACCURACY</div><div style={C.coordVal}>±{coords.accuracy}m</div></div>
              <div><div>STATUS</div><div style={C.coordVal}>LIVE</div></div>
            </div>
          )}
        </div>
        <div style={C.room}>📡 Family: {user.room}</div>
      </main>
    </div>
  );
}

// ─── FATHER ───────────────────────────────────────────────────────────────────
function Father({ user, onLogout }) {
  const [son, setSon] = useState(null);
  const [mapLoc, setMapLoc] = useState(null);

  useEffect(() => {
    const poll = async () => {
      let d = await fbGet(`sn/${user.room}/loc`);
      if (!d) d = LS.get(`${user.room}_loc`);
      if (!d) return;
      const stale = Date.now() - (d.t||0) > 18000;
      const data = { ...d, online: d.online && !stale };
      setSon(data);
      if (data.online && data.lat) {
        setMapLoc({ x: Math.max(-1,Math.min(1,(data.lng+73.9855)*80)), y: Math.max(-1,Math.min(1,-(data.lat-40.758)*80)) });
      } else setMapLoc(null);
    };
    poll();
    const t = setInterval(poll, 2500);
    return () => clearInterval(t);
  }, [user.room]);

  const online = son?.online;
  const sonName = son?.name || "Son";

  const C = {
    page: { minHeight:"100vh", background:"#050c14", fontFamily:"'DM Sans',sans-serif", color:"#e2e8f0", display:"flex", flexDirection:"column" },
    hdr: { background:"#060f18", borderBottom:"1px solid #0d3a2a", padding:"0 20px", height:"56px", display:"flex", alignItems:"center", justifyContent:"space-between" },
    logoWrap: { display:"flex", alignItems:"center", gap:"8px" },
    logoIco: { width:"28px", height:"28px", background:"linear-gradient(135deg,#4ade80,#22d3ee)", borderRadius:"7px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"14px" },
    logoTxt: { fontSize:"16px", fontWeight:"900", background:"linear-gradient(135deg,#4ade80,#22d3ee)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" },
    outBtn: { background:"transparent", border:"1px solid #0d3a2a", borderRadius:"7px", color:"#14532d", fontSize:"11px", fontWeight:"700", padding:"5px 11px", cursor:"pointer", fontFamily:"inherit" },
    main: { flex:1, padding:"18px", display:"flex", flexDirection:"column", gap:"13px", maxWidth:"540px", margin:"0 auto", width:"100%" },
    hi: { fontSize:"20px", fontWeight:"900", color:"#f59e0b" },
    hiSub: { fontSize:"10px", color:"#14532d", fontWeight:"700", marginTop:"2px" },
    mapCard: { background:"#060f18", border:"1px solid #0d3a2a", borderRadius:"18px", overflow:"hidden" },
    mapTop: { padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:"1px solid #0d3a2a" },
    mapLbl: { fontSize:"10px", fontWeight:"800", color:"#14532d", letterSpacing:"2px" },
    pill: { display:"flex", alignItems:"center", gap:"5px", background:online?"#4ade8010":"#0a0a0a", border:`1px solid ${online?"#4ade8035":"#111"}`, borderRadius:"99px", padding:"3px 11px", fontSize:"10px", fontWeight:"800", color:online?"#4ade80":"#1a1a1a" },
    dot: { width:"6px", height:"6px", borderRadius:"50%", background:online?"#4ade80":"#111", animation:online?"blink 1.2s infinite":"none" },
    mapBox: { height:"290px" },
    infoCard: { background:"#060f18", border:`1px solid ${online?"#0d3a2a":"#080f14"}`, borderRadius:"14px", padding:"16px" },
    ava: { width:"48px", height:"48px", borderRadius:"50%", background:online?"#60a5fa15":"#060f18", border:`2px solid ${online?"#60a5fa":"#0d2030"}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"24px" },
    infoName: { fontSize:"16px", fontWeight:"800", color:online?"#e2e8f0":"#14532d" },
    infoSt: { fontSize:"11px", color:online?"#4ade80":"#14532d", fontWeight:"700", marginTop:"2px" },
    grid: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:"7px", marginTop:"11px" },
    stat: { background:"#030a10", border:"1px solid #0d3a2a", borderRadius:"9px", padding:"9px 11px", fontFamily:"'DM Mono',monospace" },
    statL: { fontSize:"8px", color:"#0d4a2a", fontWeight:"800", letterSpacing:"1px" },
    statV: { fontSize:"12px", color:"#4ade80", fontWeight:"700", marginTop:"2px" },
    footer: { display:"flex", alignItems:"center", justifyContent:"space-between" },
    legend: { display:"flex", gap:"14px", fontSize:"10px", color:"#0d4a2a", fontFamily:"'DM Mono',monospace" },
    room: { background:"#0a2a14", borderRadius:"7px", padding:"4px 11px", fontSize:"10px", color:"#14532d", fontFamily:"'DM Mono',monospace", fontWeight:"700" },
  };

  return (
    <div style={C.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800;900&family=DM+Mono:wght@500;700&display=swap'); *{box-sizing:border-box} @keyframes blink{0%,100%{opacity:1}50%{opacity:0.25}}`}</style>
      <header style={C.hdr}>
        <div style={C.logoWrap}><div style={C.logoIco}>🛡️</div><span style={C.logoTxt}>SafeNest</span></div>
        <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
          <span style={{fontSize:"11px",color:"#f59e0b",fontWeight:"800"}}>👨 Father</span>
          <button style={C.outBtn} onClick={onLogout}>Log Out</button>
        </div>
      </header>
      <main style={C.main}>
        <div><div style={C.hi}>Welcome, {user.name} 👨</div><div style={C.hiSub}>Updates every 2.5 seconds</div></div>
        <div style={C.mapCard}>
          <div style={C.mapTop}>
            <span style={C.mapLbl}>🛰️ LIVE RADAR</span>
            <div style={C.pill}><div style={C.dot}/>{online?`${sonName} is LIVE`:"Waiting for Son…"}</div>
          </div>
          <div style={C.mapBox}><Radar sonLoc={mapLoc} sonOnline={!!online} sonName={sonName}/></div>
        </div>
        <div style={C.infoCard}>
          <div style={{display:"flex",gap:"13px",alignItems:"center"}}>
            <div style={C.ava}>👦</div>
            <div>
              <div style={C.infoName}>{sonName}</div>
              <div style={C.infoSt}>{online?"📡 Sharing location live":"📴 Not sharing yet"}</div>
              {son?.t&&<div style={{fontSize:"9px",color:"#0d3a2a",marginTop:"3px",fontFamily:"'DM Mono',monospace"}}>Updated: {new Date(son.t).toLocaleTimeString()}</div>}
            </div>
          </div>
          {online&&son?.lat&&(
            <div style={C.grid}>
              <div style={C.stat}><div style={C.statL}>LATITUDE</div><div style={C.statV}>{son.lat.toFixed(5)}</div></div>
              <div style={C.stat}><div style={C.statL}>LONGITUDE</div><div style={C.statV}>{son.lng.toFixed(5)}</div></div>
              <div style={C.stat}><div style={C.statL}>ACCURACY</div><div style={C.statV}>±{son.accuracy}m</div></div>
              <div style={C.stat}><div style={C.statL}>STATUS</div><div style={C.statV}>ONLINE ✓</div></div>
            </div>
          )}
        </div>
        <div style={C.footer}>
          <div style={C.legend}><span>🟡 You (Father)</span><span>🔵 {sonName}</span></div>
          <div style={C.room}>📡 {user.room}</div>
        </div>
      </main>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(() => LS.get("sess"));
  const login = (u) => setUser(u);
  const logout = () => { LS.del("sess"); setUser(null); };
  if (!user) return <Auth onAuth={login} />;
  if (user.role === ROLES.SON) return <Son user={user} onLogout={logout} />;
  return <Father user={user} onLogout={logout} />;
}
