const $ = s => document.querySelector(s);

const S = {
    scr: 'splash',
    ob: 0,
    user: 'Alex Morgan',
    email: 'alex@railoperations.co',
    filter: 'All',
    tf: 'All trains',
    q: '',
    tr: 0,
    tog: { push: true, comfort: true, sync: true },
    units: 'Metric',
    r: {
        temp: 22.4,
        hum: 46,
        co2: 612,
        pm25: 8,
        pm10: 14,
        noise: 58,
        pres: 1014,
        lux: 420
    },
    hist: {
        temp: [19.8, 20.4, 20.9, 21.2, 21.6, 21.9, 22.2, 22.4],
        co2: [34, 36, 40, 38, 35, 33, 34, 34],
        hum: [44, 45, 46, 45, 47, 46, 46, 46],
        noise: [52, 55, 58, 57, 60, 56, 59, 58]
    },
    open: {},
    nid: 10,
    al: [{
            id: 1,
            t: 'watch',
            title: 'CO₂ rising in Car 5',
            msg: 'Sample reading reached 980 ppm. Consider increasing ventilation.',
            time: '9 min ago',
            created: Date.now() - 9 * 60000,
            train: 'ICE 709',
            read: false,
            rec: 'Increase ventilation in Car 5'
        }, {
            id: 2,
            t: 'offline',
            title: 'Humidity sensor disconnected',
            msg: 'Sensor H-02 stopped reporting. Last sample received at 09:12.',
            time: '28 min ago',
            created: Date.now() - 28 * 60000,
            train: 'RJ 1035',
            read: false,
            rec: 'Check Cabin 2 sensor wiring'
        }, {
            id: 3,
            t: 'resolved',
            title: 'Air quality back to good',
            msg: 'AQI returned below 50 after ventilation adjustment.',
            time: '1 hr ago',
            created: Date.now() - 60 * 60000,
            train: 'EC 204',
            read: true
        }, {
            id: 4,
            t: 'info',
            title: 'Sample data refreshed',
            msg: 'Your dashboard now reflects the latest simulation dataset.',
            time: '2 hrs ago',
            created: Date.now() - 120 * 60000,
            train: 'System',
            read: true
        }],
    trains: [{
            c: 'EC 204 · Car 3',
            a: 'Berlin Hbf → Prague hl.n.',
            d: 'Departed 08:12 · Platform 7',
            s: 86,
            ok: true,
            spd: 126,
            stops: [['Berlin Hbf', 'Departed', '08:12', 1], ['Dresden Hbf', '24 min', '10:04', 2], ['Ústí nad Labem', 'Scheduled', '11:08', 0], ['Prague hl.n.', 'On time', '12:16', 0]]
        }, {
            c: 'ICE 709 · Car 5',
            a: 'Hamburg Hbf → München Hbf',
            d: 'Departs 10:18 · Platform 4',
            s: 91,
            ok: true,
            spd: 0,
            stops: [['Hamburg Hbf', 'Boarding', '10:18', 2], ['Hannover Hbf', 'Scheduled', '11:30', 0], ['Würzburg Hbf', 'Scheduled', '14:05', 0], ['München Hbf', 'On time', '16:00', 0]]
        }, {
            c: 'RJ 1035 · Car 2',
            a: 'Vienna Hbf → Budapest Keleti',
            d: 'Departs 11:05 · Platform 9',
            s: 72,
            ok: false,
            spd: 0,
            stops: [['Wien Hbf', 'Boarding', '11:05', 2], ['Bratislava', 'Scheduled', '12:15', 0], ['Győr', 'Scheduled', '13:05', 0], ['Budapest Keleti', 'On time', '13:50', 0]]
        }]
};
//==== ALERT ENGINE  (thresholds, classify, ingest)  - slide 11 logic ====

const TH = {
    co2: [null, 900, null, 1000],
    temp: [20, 24, 16, 28],
    hum: [30, 60, 20, 70],
    noise: [null, 70, null, 85]
};

const NM = {
    co2: 'CO₂',
    temp: 'Temperature',
    hum: 'Humidity',
    noise: 'Noise'
};

const UN = {
    co2: 'ppm',
    temp: '°C',
    hum: '%',
    noise: 'dB'
};

function classify(m, v) {
    const [lw, hw, lc, hc] = TH[m];
    if ((hc != null && v >= hc) || (lc != null && v <= lc)) {
        return 'critical';
    }
    if ((hw != null && v > hw) || (m == 'co2' && v >= hw) || (lw != null && v < lw)) {
        return 'watch';
    }
    if (hw != null && m == 'noise' && v >= hw) {
        return 'watch';
    }
    return 'ok';
}

// ENDTERM fix: one place that saves a reading. Ids come from a counter (no duplicates),
// and only live simulator readings are trimmed, so console readings and history are kept.
function addReading(sensorId, v, src) {
    DB.d.rid = (DB.d.rid || 0) + 1;
    DB.d.readings.push({
        id: DB.d.rid,
        sensor_id: sensorId,
        value: v,
        ts: new Date().toLocaleTimeString(),
        at: Date.now(),
        src: src || 'sim'
    });
    const live = DB.d.readings.filter(r => r.src == 'sim');
    if (live.length > 300) {
        const oldest = live[0];
        DB.d.readings = DB.d.readings.filter(r => r !== oldest);
    }
}

function ingest(m, v, src) {
    autoVent(m, v);
    const lv = classify(m, v);
    const o = S.open[m];
    addReading(SID[m], v, src);
    if (lv == 'ok' && o) {
        o.from = o.t;              // keep the original type for the analysis
        o.t = 'resolved';
        o.title = NM[m] + ' back to normal';
        o.msg = `${NM[m]} returned to ${v} ${UN[m]}. Auto-resolved.`;
        o.time = 'just now';
        o.res_at = Date.now();     // ENDTERM: time of resolution -> response time
        o.auto = true;
        delete S.open[m];
        toast('Resolved: ' + NM[m] + ' back to normal');
    }
    else if (lv != 'ok' && !o) {
        const a = {
            id: S.nid++,
            m,
            t: lv == 'critical' ? 'critical' : 'watch',
            title: `${NM[m]} ${lv == 'critical' ? 'critical' : 'rising'} in Car 3`,
            msg: `Sample reading reached ${v} ${UN[m]}. ${m == 'co2' ? 'Consider increasing ventilation.' : 'Check cabin conditions.'}`,
            time: 'just now',
            created: Date.now(),
            car: 'Car 3',
            train: 'EC 204',
            read: false,
            rec: topAdvice(m, v)
        };
        S.al.unshift(a);
        S.open[m] = a;
        if (S.tog.push && S.tog.comfort) {
            toast('New alert: ' + a.title);
        }
    }
    else if (lv == 'critical' && o && o.t == 'watch') {
        o.t = 'critical';
        o.title = NM[m] + ' critical in Car 3';
        o.msg = `Escalated: ${v} ${UN[m]}.`;
        o.read = false;
        o.time = 'just now';
    }
}
//==== SENSOR SIMULATION  (random readings every 4 s) ====

function jit() {
    const r = S.r;
    const j = (v, d, a, b) => Math.min(b, Math.max(a, v + (Math.random() - .5) * d));
    r.temp = +j(r.temp, .4, 18, 26).toFixed(1);
    r.hum = Math.round(j(r.hum, 2, 38, 54));
    r.noise = Math.round(j(r.noise, 3, 50, 66));
    // ENDTERM: closed loop. The ventilation level now changes the simulated CO₂:
    // HIGH removes 40 ppm and MAX 80 ppm per update (every 4 s).
    const drop = { NORMAL: 0, HIGH: 40, MAX: 80 }[DB.d.vent] || 0;
    if (S.hold) {
        r.co2 = Math.max(560, r.co2 - drop);
        if (r.co2 < 900) {
            S.hold = 0;
        }
    }
    else {
        r.co2 = Math.round(j(r.co2, 40, 560 - drop, 700 - drop));
    }
    r.pm25 = Math.round(j(r.pm25, 1.5, 5, 12));
    r.pm10 = Math.round(j(r.pm10, 2, 10, 18));
    for (const m of ['co2', 'temp', 'hum', 'noise']) {
        ingest(m, r[m]);
    }
    const H = S.hist;
    H.temp.push(r.temp);
    H.temp.shift();
    H.hum.push(r.hum);
    H.hum.shift();
    H.noise.push(r.noise);
    H.noise.shift();
    H.co2.push(aqi());
    H.co2.shift();
}
//==== DERIVED VALUES ====

const aqi = () => Math.round(S.r.pm25 * 2.2 + S.r.co2 / 80 + 10);

function score() {
    let s = 100;
    for (const m of ['co2', 'temp', 'hum', 'noise']) {
        const l = classify(m, S.r[m]);
        s -= l == 'critical' ? 20 : l == 'watch' ? 8 : 0;
    }
    return Math.max(40, s - 14);
}

const unread = () => S.al.filter(a => !a.read && a.t != 'info').length;

function toast(t) {
    const e = $('#toast');
    e.textContent = t;
    e.className = 's';
    clearTimeout(toast.t);
    toast.t = setTimeout(() => e.className = '', 2200);
}

// ENDTERM security fix: escape text typed by users before it is put into HTML.
// Without this, a report like <img src=x onerror=alert(1)> ran as code on the captain's screen.
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ENDTERM: real "x min ago" from the saved timestamp (before: fixed text like "just now")
function ago(a) {
    if (!a.created) {
        return a.time;
    }
    const min = Math.round((Date.now() - a.created) / 60000);
    return min < 1 ? 'just now' : min < 60 ? min + ' min ago' : Math.round(min / 60) + ' h ago';
}

const go = s => {
    if (!S.role && !['splash', 'onboarding', 'register', 'login'].includes(s)) {
        s = 'login';
        setTimeout(() => toast('Please sign in first'), 50);
    }
    S.err = null;      // a new screen starts without old error messages
    S.scr = s;
    render();
    $('#v').scrollTop = 0;
};

const T = v => S.units == 'Imperial' ? (v * 9 / 5 + 32).toFixed(1) + '°F' : v + '°C';

const bars = (a, c = '') => `<div class="bars ${c}">${a.map(v => `<i style="height:${Math.round((v - Math.min(...a) + .3) / (Math.max(...a) - Math.min(...a) + .3) * 80)}%"></i>`).join('')}</div>`;

const ring = (n, c, sz) => `<div class="ring" style="background:conic-gradient(${c} ${n}%,#d8e5dd 0)"><i>${n}</i></div>`;
//==== UI HELPERS  (reusable HTML snippets) ====

const hdr = (t, sub, back, btn) => `<div class="row sp" style="margin:6px 0 12px">
<div class="row">${back ? `<button class="back" onclick="go('${back}')">‹</button>` : ''}<div>
<div style="font-size:20px;font-weight:500">${t}</div>
<div class="mt">${sub || ''}</div></div></div>${btn || ''}</div>`;

const mc = (ic, l, v, u, ch, cls) => `<div class="card click" style="margin:0" onclick="${cls || ''}">
<div class="row sp">
<div class="ic">${ic}</div><span class="chip ${ch[1] || ''}">${ch[0]}</span></div>
<div class="mt" style="margin-top:8px">${l}</div>
<div class="big">${v}<span style="font-size:12px;color:var(--mt)"> ${u}</span></div></div>`;

const lv = (m) => {
    const l = classify(m, S.r[m]);
    return l == 'ok' ? null : l;
};

const tabs = ['home', 'trains', 'alerts', 'profile'];
//==== SCREENS  (one function per screen, returns HTML) ====

const SC = {
    insights() {
        return insightsScreen();
    },
    splash() {
        return `<div class="splash">
<div class="logo">🌲</div>
<div style="font-size:34px"><b>Eco</b>Train</div>
<p style="opacity:.85;font-size:13px;margin:10px 0 40px">Cleaner journeys, powered by live environmental insight.</p>
<div class="dots"><i class="on"></i><i></i><i></i></div>
<div style="font-size:11px;opacity:.8">Preparing sample sensor workspace…</div>
<div style="font-size:10px;opacity:.5;margin-top:6px">EcoTrain mobile • v1.0</div></div>`;
    },
    onboarding() {
        const p = [['Every carriage, breathing better', 'Track temperature, air quality, humidity and noise across your train—clearly, securely and in one place.', '🚆'], ['Alerts before it escalates', 'Watch and critical thresholds warn staff early, with a full incident history.', '🔔'], ['Many trains, one app', 'Fleet operators monitor several trains and cars from a single dashboard.', '🗺️']][S.ob];
        return `<div class="row sp">
<div class="row">
<div class="ic" style="background:var(--g);color:#fff">🌲</div><b>EcoTrain</b></div>
<button class="lk" onclick="go('login')">Skip</button></div>
<div class="hero" style="margin:14px 0">${p[2]}<span class="chip" style="position:absolute;top:12px;right:12px;background:#fff">● LIVE READY</span></div>
<h1 style="text-align:center;font-size:25px">${p[0]}</h1>
<p class="mt" style="text-align:center;font-size:13px;line-height:1.5">${p[1]}</p>
<div class="dots">${[0, 1, 2].map(i => `<i class="${i == S.ob ? 'on' : ''}"></i>`).join('')}</div>
<button class="btn" onclick="S.ob<2?(S.ob++,render()):go('register')">${S.ob < 2 ? 'Next →' : '→ Get started'}</button>
<p class="mt" style="text-align:center">Preview uses clearly labeled sample sensor data</p>`;
    },
    register() {
        return `${hdr('Create account', '', 'onboarding')}<h1 style="font-size:24px">Join the cleaner journey</h1>
<p class="mt" style="margin-bottom:14px">Create your workspace to monitor sample train environments and prepare for future live sensor connections.</p>
<label>Full name</label>
<input class="in" id="rn" value="Alex Morgan">
<label>Work email</label>
<input class="in" id="re" value="alex@railoperations.co">
<label>I am a</label>
<select class="in" id="rr"><option value="passenger">Passenger</option><option value="captain">Train captain</option></select>
<label>Staff code (captains only)</label>
<input class="in" id="rc" placeholder="RAIL2026">
<label>Password</label>
<input class="in" id="rp" type="password" value="password1">
<label class="row" style="font-weight:400">
<input type="checkbox" id="rt" checked> I agree to the <span class="lk">Terms of Service</span> and <span class="lk">Privacy Policy</span></label>
${errBox()}
<button class="btn" onclick="doReg()">Create account</button>
<p class="mt" style="text-align:center">or continue with</p>
<div class="grid">
<button class="btn o" onclick="toast('Apple sign-in (demo)')"></button>
<button class="btn o" onclick="toast('Google sign-in (demo)')">G</button></div>
<p class="mt" style="text-align:center">Already have an account? <button class="lk" onclick="go('login')">Log in</button></p>`;
    },
    login() {
        return `<div class="row" style="margin:14px 0 20px">
<div class="ic" style="background:var(--g);color:#fff">🌲</div><b style="font-size:18px">EcoTrain</b></div>
<h1 style="font-size:28px">Welcome back</h1>
<p class="mt" style="margin-bottom:18px">Sign in to continue monitoring healthier train environments.</p>
<label>Email</label>
<input class="in" id="le" placeholder="name@mail.com">
<label>Password</label>
<input class="in" id="lp" type="password" value="" placeholder="Password">
<div class="row sp">
<label class="row" style="font-weight:400">
<input type="checkbox" checked> Remember me</label>
<button class="lk" onclick="toast('Reset link sent (demo)')">Forgot password?</button></div>
${errBox()}
<button class="btn" onclick="doLogin()">→ Sign in</button>
<div class="card" style="padding:10px 12px;margin:4px 0"><div class="mt" style="margin-bottom:6px">Test accounts: tap to fill in, then press Sign in</div>
<div class="grid"><button class="btn o" style="margin:0;padding:10px" onclick="demo(1)">👨‍✈️ Captain</button><button class="btn o" style="margin:0;padding:10px" onclick="demo(2)">🧳 Passenger</button></div></div>
<p class="mt" style="text-align:center">or</p>
<button class="btn o" onclick="toast('Apple sign-in (demo)')"> Continue with Apple</button>
<div class="note" style="padding:12px">✦ Explore without hardware<br><span class="mt">Use sample data now. Connect your IoT fleet and backend later.</span> <button class="lk" onclick="login(DB.d.users[1])">Explore as passenger →</button></div>
<p class="mt" style="text-align:center">New to EcoTrain? <button class="lk" onclick="go('register')">Create account</button></p>`;
    },
    home() {
        const t = S.trains[S.tr];
        const sc = score();
        const a = aqi();
        const n = (m) => lv(m);
        const chip = m => {
            const l = lv(m);
            return l ? [l.toUpperCase(), l == 'critical' ? 'r' : 'w'] : ['NORMAL'];
        };
        return `<div class="row sp">
<div><div class="mt" style="font-size:12px">Good morning, ${esc(S.user.split(' ')[0])}</div>
<h1 style="margin:0">Your train environment</h1></div>
<button class="back" onclick="go('alerts')">🔔${unread() ? `<span class="badge" style="top:60px;right:20px;left:auto">${unread()}</span>` : ''}</button></div>
<div class="card dk click" style="margin-top:12px" onclick="go('trains')">
<div class="row">
<div class="ic">🚆</div>
<div style="flex:1"><b>${esc(t.c.replace(' · ', ' • '))}</b> <span class="chip dkc">CONNECTED</span>
<div class="mt">${esc(t.a)}</div></div>⌄</div></div>
<div class="note">☁ Sample data • ready for live sensor sync</div>${reminderCard()}
<div class="card">
<div class="row">${ring(sc, 'var(--g)')}<div><b style="font-size:16px">Healthy cabin</b> <span class="chip">${sc > 80 ? 'GOOD' : sc > 60 ? 'FAIR' : 'POOR'}</span>
<div class="mt" style="margin-top:4px">${sc > 80 ? 'All sample indicators are within recommended comfort ranges.' : 'Some indicators are outside comfort ranges — see Alerts.'}</div>
<div class="mt" style="color:var(--g);font-weight:600">↑ 4 points since departure</div></div></div></div>
<h2>Live sample metrics <a onclick="go('other')">View all</a></h2>
<div class="grid">
${mc('🌡', 'Temperature', T(S.r.temp).replace(/°[CF]/, ''), S.units == 'Imperial' ? '°F' : '°C', chip('temp'), "go('temp')")}
${mc('💨', 'Air quality', a, 'AQI', [a < 50 ? 'GOOD' : 'MODERATE', a < 50 ? '' : 'w'], "go('air')")}
${mc('💧', 'Humidity', S.r.hum, '%', chip('hum').map((x, i) => i ? x : x == 'NORMAL' ? 'IDEAL' : x), "go('other')")}
${mc('🔊', 'Noise', S.r.noise, 'dB', lv('noise') ? ['LOUD', 'w'] : ['CALM', 'w'], "go('other')")}</div>`;
    },
    temp() {
        const r = S.r.temp;
        const H = S.hist.temp;
        const l = lv('temp');
        return `${hdr('Temperature', 'EC 204 • Car 3', 'home', '<button class="back" onclick="toast(\'Exported sample CSV\')">⋯</button>')}<div class="card">
<div class="row">
<div class="ring" style="width:100px;height:100px;background:conic-gradient(var(--g) ${Math.min(100, (r - 10) * 4)}%,#d8e5dd 0)"><i style="width:80px;height:80px;font-size:20px">${T(r)}</i></div>
<div><span class="chip ${l ? 'w' : ''}">${l ? 'OUTSIDE RANGE' : 'COMFORTABLE'}</span>
<div style="font-size:19px;margin:6px 0">${l ? 'Adjust HVAC' : 'Ideal cabin range'}</div>
<div class="mt">Recommended comfort: 20–24°C</div></div></div></div>
<div class="note">Sample sensor T-03 • live API ready</div>
<div class="card">
<div class="row sp"><b>Temperature trend</b><span class="chip">6H</span></div>
<div class="mt" style="margin-bottom:8px">Last 6 hours • sample</div>${bars(H)}</div>
<h2>Today at a glance</h2>
<div class="grid" style="grid-template-columns:repeat(3,1fr)">
<div class="card" style="text-align:center">
<div class="mt">Minimum</div><b>${T(Math.min(...H))}</b></div>
<div class="card" style="text-align:center">
<div class="mt">Maximum</div><b>${T(Math.max(...H))}</b></div>
<div class="card" style="text-align:center">
<div class="mt">Average</div><b>${T(+(H.reduce((a, b) => a + b) / H.length).toFixed(1))}</b></div></div>
<div class="card row click" onclick="toast('HVAC automation armed: 20–24°C')">🍃 <span class="mt" style="flex:1">Comfort automation ready — tap to arm HVAC thresholds.</span></div>`;
    },
    air() {
        const a = aqi();
        const co = S.r.co2;
        const l = lv('co2');
        return `${hdr('Air quality', 'EC 204 • Car 3', 'home', '<button class="back" onclick="toast(\'AQI scale: 0–50 good · 51–100 moderate\')">ⓘ</button>')}
<div class="card dk">
<div class="row">
<div class="ring" style="width:96px;height:96px;background:conic-gradient(#6fd1a3 ${Math.min(100, a)}%,#2b4a3c 0)"><i style="width:76px;height:76px;font-size:28px;color:#fff">${a}</i></div>
<div><span class="chip dkc">${l ? 'WATCH' : 'GOOD AIR'}</span>
<div style="font-size:20px;margin:6px 0">${l ? 'Ventilate' : 'Breathe easy'}</div>
<div class="mt">Low particulate levels in this carriage.<br>Updated 09:40 • sample data</div></div></div></div>
<div class="note">Sample air sensor AQ-03 • MQTT + backend hooks ready</div>
<h2>Pollutants <a onclick="limits()">Limits</a></h2>
<div class="grid">
<div class="card" style="margin:0"><span class="chip">LOW</span>
<div class="mt">PM2.5</div>
<div class="big">${S.r.pm25} <small class="mt">µg/m³</small></div></div>
<div class="card" style="margin:0"><span class="chip">LOW</span>
<div class="mt">PM10</div>
<div class="big">${S.r.pm10} <small class="mt">µg/m³</small></div></div></div>
<div class="card row sp" style="margin-top:10px">
<div><div class="mt">Carbon dioxide (CO₂)</div>
<div class="big">${co} <small class="mt">ppm</small></div></div><span class="chip ${l == 'critical' ? 'r' : l ? 'w' : ''}">${l ? l.toUpperCase() : 'FRESH'}</span></div>
<div class="card"><b>Air quality trend</b>
<div class="mt" style="margin-bottom:8px">AQI • last 12 hours</div>${bars(S.hist.co2, 'bl')}</div>
<div class="card" id="lim" style="display:none;background:#eef3fb"><b>CO₂ limits</b>
<div class="mt">Watch ≥ 900 ppm · Critical ≥ 1000 ppm. Now: ${l ? l.toUpperCase() : 'OK'} — ${l ? 'action needed' : 'no action needed'}.</div></div>
<div class="note" style="background:#e9f0fa;color:var(--bl)">🛡 ${l ? 'Increase ventilation in this car.' : 'Suitable for all passenger groups. No action needed.'}</div>
<button class="btn o" style="display:${S.role == 'captain' ? 'block' : 'none'}" onclick="spike()">⚡ Simulate CO₂ spike (demo)</button>
<button class="btn o" style="display:${S.role == 'captain' ? 'block' : 'none'}" onclick="S.hold=0;S.r.co2=700;toast('CO₂ restored to 700 ppm');render()">Restore normal CO₂</button>`;
    },
    other() {
        const R = S.r;
        return `${hdr('Other indicators', 'EC 204 • Car 3', 'home')}<div class="card dk">
<div class="row">
<div class="ic">📈</div>
<div><b style="font-size:17px">Cabin comfort</b> <span class="chip dkc">BALANCED</span>
<div class="mt">Humidity and sound remain within ideal ranges.<br>Updated 09:40</div></div></div></div>
<div class="note">Sample telemetry • four additional sensor channels mapped</div>
<h2>Comfort metrics</h2>
<div class="grid">
${mc('💧', 'Humidity', R.hum, '% RH', ['IDEAL'])}${mc('🔊', 'Noise', R.noise, 'dB', lv('noise') ? ['LOUD', 'w'] : ['CALM', 'w'])}${mc('☀️', 'Illuminance', R.lux, 'lux', ['GOOD'])}${mc('⏱', 'Pressure', R.pres, 'hPa', ['STABLE'])}</div>
<h2>Recent movement <a>24 hours</a></h2>
<div class="grid">
<div class="card" style="margin:0">
<div class="row sp"><span class="mt">Humidity</span><b>${R.hum}%</b></div>${bars(S.hist.hum)}</div>
<div class="card" style="margin:0">
<div class="row sp"><span class="mt">Noise</span><b>${R.noise} dB</b></div>${bars(S.hist.noise)}</div></div>
<div class="card row sp" style="margin-top:10px">📡 <span style="flex:1;font-size:12px">4 of 4 sample sensors online
<div class="mt">Gateway GW-EC204-03 • latency 38 ms</div></span><span class="chip">SYNCED</span></div>`;
    },
    trains() {
        const L = S.trains.map((t, i) => ({ ...t, i })).filter(t => (S.tf == 'All trains' || (S.tf == 'Connected' && t.ok) || (S.tf == 'Needs attention' && !t.ok)) && (t.c + t.a).toLowerCase().includes(S.q.toLowerCase()));
        return `${hdr('Choose a train', '3 sample trains available', '', '<button class="back" onclick="addTrain()">＋</button>')}<input class="in" placeholder="🔍 Search train or route" value="${esc(S.q)}" oninput="S.q=this.value;rf()" id="sq" style="margin-top:0">
<div class="tabs">${['All trains', 'Connected', 'Needs attention'].map(f => `<button class="${S.tf == f ? 'on' : ''}" onclick="S.tf='${f}';render()">${f}</button>`).join('')}</div>
<div class="note">Sample fleet • backend train registry ready</div>${S.addT ? trainForm() : ''}<h2>Your trains <a>Sort: departure</a></h2>
${L.map(t => `<div class="card click ${t.i == S.tr ? 'dk' : ''}" onclick="S.tr=${t.i};go('route')">
<div class="row sp">
<div class="row">
<div class="ic">🚆</div>
<div><b>${esc(t.c)}</b>
<div class="mt">${esc(t.d)}</div></div></div><span class="chip ${t.ok ? (t.i == S.tr ? 'dkc' : '') : 'w'}">${t.ok ? 'CONNECTED' : '1 SENSOR OFF'}</span></div>
<div style="font-size:13px;font-weight:600;margin:8px 0 4px">${esc(t.a)}</div>
<div class="row sp mt"><span>● ${t.custom ? '0' : '8'} sensors • ${t.custom ? 'just added' : 'updated 09:40'} ${t.custom && S.role == 'captain' ? '<button class="lk" style="color:var(--rd)" onclick="event.stopPropagation();delTrain(' + t.i + ')">Delete</button>' : ''}</span><b style="color:${t.ok ? 'var(--g)' : 'var(--am)'}">${t.s}/100</b></div></div>`).join('') || '<p class="mt">No trains match.</p>'}`;
    },
    route() {
        const t = S.trains[S.tr];
        return `${hdr(esc(t.c), esc(t.a.replace(' → ', ' – ')), 'trains', '<button class="back" onclick="go(\'home\')">⌂</button>')}<div class="card dk">
<div class="row sp">
<div><div>On time <span class="chip dkc">● LIVE ROUTE</span></div>
<div class="mt">Next: ${t.stops[1][0]} in ${t.stops[1][1]}<br>Sample position • updated 09:40</div></div><b style="font-size:20px">${t.spd}<small> km/h</small></b></div></div>
<div class="card" style="padding:0;overflow:hidden">
<svg viewBox="0 0 340 200" style="display:block;background:#e6efe9"><path d="M20 160 Q100 120 150 100 T320 40" stroke="#2f7d5b" stroke-width="5" fill="none" stroke-dasharray="${t.spd ? '0' : '8 6'}"/><circle cx="20" cy="160" r="7" fill="#fff" stroke="#2f7d5b" stroke-width="3"/><circle cx="320" cy="40" r="7" fill="#fff" stroke="#2f7d5b" stroke-width="3"/><circle cx="150" cy="100" r="13" fill="#2f7d5b"/><text x="144" y="105" font-size="13" fill="#fff">🚆</text><text x="8" y="188" font-size="10" fill="#6b7c74">SAMPLE ROUTE PREVIEW</text></svg></div>
<div class="note">GPS and timetable are sample data • GTFS/backend ready</div>
<h2>Route progress <a onclick="toast('Full timetable (demo)')">Details</a></h2>
<div class="card">${t.stops.map(s => `<div class="row sp" style="padding:8px 0">
<div class="row"><span style="color:${s[3] ? 'var(--g)' : '#aab'}">${s[3] == 1 ? '✔' : s[3] == 2 ? '◉' : '○'}</span>
<div><b style="font-size:13px">${esc(s[0])}</b>
<div class="mt">${s[1]}</div></div></div><span style="font-size:13px">${s[2]}</span></div>`).join('')}</div>
<button class="btn" onclick="go('home')">View cabin environment</button>`;
    },
    alerts() {
        const c = S.al.filter(a => S.filter == 'All' || (S.filter == 'Alerts' && a.t != 'info' && a.t != 'resolved') || (S.filter == 'Updates' && (a.t == 'info' || a.t == 'resolved')));
        const al = S.al.filter(a => ['watch', 'critical', 'offline'].includes(a.t)).length;
        const cap = S.role == 'captain';
        return `${hdr('Notifications', unread() + ' unread sample alerts', '', '<button class="back" onclick="markAll()">✓✓</button>')}<div class="tabs">${[['All', S.al.length], ['Alerts', al], ['Updates', S.al.length - al]].map(f => `<button class="${S.filter == f[0] ? 'on' : ''}" onclick="S.filter='${f[0]}';render()">${f[0]} ${f[1]}</button>`).join('')}</div>
<div class="note">Sample alerts • ${cap ? 'tap an alert to open and resolve it' : 'tap an alert to see details'}</div>
${cap ? reminderCard() : myReports()}<h2>Today <a onclick="markAll()">Mark all as read</a></h2>
${c.map(alertCard).join('')}
<button class="btn o" onclick="toast('No earlier notifications (demo)')">View earlier notifications</button>
${cap ? sensorConsole() : reportForm()}<h2>Incident history</h2>
<input class="in" id="hq" placeholder="🔍 Search by train, alert or status" value="${esc(S.hq || '')}" oninput="S.hq=this.value;rf2()" style="margin-top:0">${S.al.filter(a => a.t != 'info' && (a.train + a.title + a.t + (a.note || '')).toLowerCase().includes((S.hq || '').toLowerCase())).map(a => `<div class="mt click" style="padding:4px 0;border-bottom:1px solid var(--ln)" onclick="openInc(${a.id})">${esc(a.train)} · ${esc(a.title)} — ${a.t}${a.note ? ' · ✔ ' + esc(a.note) : ''}</div>`).join('')}`;
    },
    // ENDTERM: incident detail screen = the user flow from Assignment 2
    // (alert → view detail → confirm action → log & close), now working
    incident() {
        const a = S.al.find(x => x.id == S.inc);
        if (!a) {
            return `${hdr('Incident', '', 'alerts')}<p class="mt">This incident no longer exists.</p>`;
        }
        const cap = S.role == 'captain';
        const open = isOpen(a);
        const live = a.train == 'EC 204';
        const rv = recVent(a);
        const vent = DB.d.vent || 'NORMAL';
        const mode = DB.d.ventMode || 'auto';
        const co2pts = DB.d.readings.filter(r => r.sensor_id == 'AQ-03').slice(-40);
        return `${hdr('Incident #' + a.id, esc(a.train + (a.car ? ' · ' + a.car : '')), 'alerts')}
<div class="card al ${alCls(a)}">
<div class="row sp"><b style="font-size:14px">${esc(a.title)}</b>${typeChip(a)}</div>
<div class="mt" style="margin:6px 0">${esc(a.msg)}</div>
<div class="mt">Source: ${a.src == 'passenger' ? 'passenger report' : a.m ? 'sensor ' + SID[a.m] : 'system'} · created ${ago(a)}</div></div>
<h2>1 · Sensor check</h2>
${live ? `<div class="card"><div class="grid" style="grid-template-columns:repeat(4,1fr);text-align:center">${['co2', 'temp', 'hum', 'noise'].map(m => `<div><div class="mt">${NM[m]}</div><b>${S.r[m]}</b><div class="mt">${UN[m]}</div>${statusChip(m)}</div>`).join('')}</div>
<div class="mt" style="margin:10px 0 2px">CO₂, last ${co2pts.length} saved readings (sensor AQ-03)</div>${co2Chart(co2pts, 300, 120)}
<div class="note" style="margin-bottom:0">${sensorVerdict(a)}</div></div>` : `<div class="note">No live sensors are connected for ${esc(a.train)} in this prototype. Only EC 204 · Car 3 has simulated sensors.</div>`}
<h2>2 · Recommended action <span class="chip">SMART ADVISOR</span></h2>
<div class="card">${adviceList(incAdvice(a))}</div>
<h2>3 · Ventilation ${live ? 'in Car 3' : ''}</h2>
${!live ? '<div class="note">Ventilation control is connected only for EC 204 · Car 3 in this prototype.</div>' : `<div class="card"><div class="row sp"><div><div class="mt">Current level · mode</div><b style="font-size:16px">${vent} · ${mode.toUpperCase()}</b></div><span class="chip ${vent == 'MAX' ? 'r' : vent == 'HIGH' ? 'w' : ''}">${vent}</span></div>
${cap && open && rv != 'NORMAL' && live ? `<button class="btn" onclick="applyAction(${a.id})">▶ Apply recommended: ventilation ${rv}</button>` : ''}
${cap ? ventButtons() : '<div class="mt" style="margin-top:6px">Ventilation is controlled by the crew.</div>'}</div>`}
<h2>4 · Close the incident</h2>
${a.t == 'resolved' ? `<div class="card"><b style="color:var(--g)">✔ Resolved${a.res_at ? ' at ' + new Date(a.res_at).toLocaleTimeString() : ''}</b>
<div class="mt" style="margin-top:4px">${a.auto ? 'Closed automatically: the value returned to normal.' : 'By ' + esc(userName(a.res_by))}${a.note ? '<br>Action taken: ' + esc(a.note) : ''}</div>
${respMs(a) != null ? `<div class="mt">Response time: ${(respMs(a) / 60000).toFixed(1)} min</div>` : ''}</div>
${cap && a.auto && !a.note ? `<div class="card"><label>Add the action taken (required to save)</label>
<textarea class="in" id="an" rows="2" placeholder="e.g. Checked the car after ventilation MAX" oninput="S.note=this.value">${esc(S.note || '')}</textarea>
${errBox()}<button class="btn o" onclick="resolveInc(${a.id})">Save note</button></div>` : ''}`
            : !open ? '<div class="note">This is an information message. Nothing to close.</div>'
                : cap ? `<div class="card"><label>Action taken (required)</label>
<textarea class="in" id="an" rows="3" placeholder="e.g. Ventilation set to HIGH, checked door 2" oninput="S.note=this.value">${esc(S.note || '')}</textarea>
${errBox()}
<button class="btn" onclick="resolveInc(${a.id})">✔ Resolve incident</button></div>`
                    : '<div class="note">🔒 Only train captains can resolve incidents. You will see the result in "My reports".</div>'}`;
    },
    profile() {
        const tg = k => `<button class="tg ${S.tog[k] ? 'on' : ''}" onclick="S.tog['${k}']=!S.tog['${k}'];render()"></button>`;
        const I = n => `<div class="ic">${n}</div>`;
        return `${hdr('Profile & settings', '', '', '<button class="back" onclick="editName()">✎</button>')}<div class="card dk">
<div class="row">
<div class="ring" style="width:54px;height:54px;font-size:16px;background:var(--g);color:#fff"><i style="width:100%;height:100%;background:var(--g)">${esc(S.user.split(' ').map(x => x[0]).join(''))}</i></div>
<div><b style="font-size:17px">${esc(S.user)}</b>
<div class="mt">${esc(S.email)}</div><span class="chip dkc">● ${S.role == 'captain' ? 'TRAIN CAPTAIN' : 'PASSENGER'}</span> <span class="mt">Central Europe</span></div></div></div>
<div class="note">Demo workspace • identity/backend integration ready</div>${S.edit ? editForm() : ''}
<div class="card row sp click" onclick="go('trains')">
<div class="row">${I('🏢')}<div><b style="font-size:13px">Rail Operations Europe</b>
<div class="mt">3 sample trains • 24 sensor channels</div></div></div>›</div>
<h2>Preferences</h2>
<div class="card">${[['push', '🔔', 'Push notifications', 'Sensor alerts and service updates'], ['comfort', '📈', 'Comfort alerts', 'Notify when thresholds are crossed'], ['sync', '☁️', 'Background sync', 'Ready for future live IoT data']].map(p => `<div class="row sp" style="padding:7px 0">
<div class="row">${I(p[1])}<div><b style="font-size:13px">${p[2]}</b>
<div class="mt">${p[3]}</div></div></div>${tg(p[0])}</div>`).join('')}</div>
<h2>App settings</h2>
<div class="card">
<div class="row sp click" style="padding:7px 0;cursor:pointer" onclick="S.units=S.units=='Metric'?'Imperial':'Metric';render()">
<div class="row">${I('📏')}<div><b style="font-size:13px">Units</b>
<div class="mt">Temperature and distance</div></div></div><span class="lk">${S.units}</span></div>
<div class="row sp" style="padding:7px 0;cursor:pointer" onclick="toast('Data retention: 90 days')">
<div class="row">${I('🛡')}<div><b style="font-size:13px">Privacy & data</b>
<div class="mt">Permissions and data retention</div></div></div>›</div>
<div class="row sp" style="padding:7px 0;cursor:pointer" onclick="toast('Support: support@ecotrain.app')">
<div class="row">${I('❔')}<div><b style="font-size:13px">Help & support</b>
<div class="mt">Guides and contact options</div></div></div>›</div></div>
${dbCard()}<button class="btn" style="background:#fbe0e0;color:var(--rd)" onclick="signOut()">Sign out</button>
<p class="mt" style="text-align:center">EcoTrain v1.0 • Sample environment</p>`;
    }
};
//==== NAVIGATION AND RENDERING ====

const NAMES = {
    splash: 'Splash',
    onboarding: 'Onboarding',
    register: 'Registration',
    login: 'Login',
    home: 'Home dashboard',
    temp: 'Temperature details',
    air: 'Air quality details',
    other: 'Other indicators',
    trains: 'Train selection',
    route: 'Train details & map',
    alerts: 'Notifications',
    incident: 'Incident detail',
    insights: 'Insights',
    profile: 'Profile & settings'
};

const NAV = {
    home: 'home',
    temp: 'home',
    air: 'home',
    other: 'home',
    trains: 'trains',
    route: 'trains',
    alerts: 'alerts',
    incident: 'alerts',
    insights: 'insights',
    profile: 'profile'
};

function render() {
    const sc = S.scr;
    $('#v').innerHTML = SC[sc]();
    $('#v').style.padding = sc == 'splash' ? 0 : '';
    $('#nav').innerHTML = NAV[sc] ? [['home', '⌂', 'Home'], ['trains', '🚆', 'Trains'], ['alerts', '🔔', 'Alerts'], ['insights', '💡', 'Insights'], ['profile', '👤', 'Profile']].map(n => `<button class="${NAV[sc] == n[0] ? 'on' : ''}" onclick="go('${n[0]}')"><b>${n[1]}</b>${n[2]}${n[0] == 'alerts' && unread() ? `<span class="badge">${unread()}</span>` : ''}</button>`).join('') : '';
    // ENDTERM: keep the red border on the field that caused the current error
    if (S.err && S.err.scr == sc && $('#' + S.err.id)) {
        $('#' + S.err.id).classList.add('bad');
    }
    DB.d.alerts = S.al;
    DB.d.settings = { tog: S.tog, units: S.units };   // ENDTERM: settings are saved too
    DB.save();
    S.sg = sig();
    if (sc == 'splash') {
        clearTimeout(render.t);
        render.t = setTimeout(() => S.scr == 'splash' && go('onboarding'), 2200);
    }
}

// ENDTERM fix: the screen refreshes every 4 s. Before, this wiped typed text and
// error messages. refresh() keeps the values of all fields and the scroll position.
function refresh() {
    const keep = {};
    document.querySelectorAll('#v input, #v select, #v textarea').forEach(e => {
        if (e.id) {
            keep[e.id] = e.type == 'checkbox' ? e.checked : e.value;
        }
    });
    const y = $('#v').scrollTop;
    const f = document.activeElement;
    const focus = f && f.id && f.matches('input,textarea') ? [f.id, f.selectionStart, f.selectionEnd] : null;
    render();
    for (const id in keep) {
        const e = $('#' + id);
        if (e) {
            if (e.type == 'checkbox') {
                e.checked = keep[id];
            }
            else {
                e.value = keep[id];
            }
        }
    }
    $('#v').scrollTop = y;
    // put the cursor back where the user was typing
    if (focus && $('#' + focus[0])) {
        const e = $('#' + focus[0]);
        e.focus();
        if (e.setSelectionRange && focus[1] != null) {
            e.setSelectionRange(focus[1], focus[2]);
        }
    }
}

function rf() {
    const f = $('#sq')?.selectionStart;
    render();
    const e = $('#sq');
    if (e) {
        e.focus();
        e.setSelectionRange(f, f);
    }
}
//==== USER ACTIONS ====

function markAll() {
    S.al.forEach(a => a.read = true);
    toast('All marked as read');
    render();
}

function ack(id) {
    if (S.role != 'captain') {
        return deny();
    }
    const a = S.al.find(x => x.id == id);
    logEvent('user', 'Alert #' + id + ' acknowledged by ' + S.user);
    a.ack = true;
    a.ack_by = DB.d.session;   // acknowledged_by (user id), as in the ER diagram
    a.ack_at = new Date().toLocaleTimeString();
    a.ack_ms = Date.now();     // ENDTERM: used for the response time
    a.read = true;
    toast('Acknowledged by ' + S.user);
    render();
}

function spike() {
    if (S.role != 'captain') {
        return deny();
    }
    // ENDTERM: one critical value; the ventilation then brings it down step by step
    S.hold = 1;
    S.r.co2 = 1150;
    ingest('co2', 1150, 'console');
    toast('CO₂ 1150 ppm → CRITICAL, ventilation MAX');
    render();
}

function limits() {
    const e = $('#lim');
    e.style.display = e.style.display == 'none' ? 'block' : 'none';
}

function addTrain() {
    if (S.role != 'captain') {
        return deny();
    }
    S.addT = !S.addT;
    render();
}

function editName() {
    S.edit = !S.edit;
    render();
}

function doReg() {
    S.err = null;
    const n = $('#rn').value.trim();
    const e = $('#re').value.trim().toLowerCase();
    const p = $('#rp').value;
    const r = $('#rr').value;
    const c = $('#rc').value.trim();
    // ENDTERM: required fields first, each message names the missing value
    if (!n) {
        return fail('Full name is required', 'rn');
    }
    if (!e) {
        return fail('Work email is required', 're');
    }
    if (!p.trim()) {
        return fail('Password is required', 'rp');
    }
    if (r == 'captain' && !c) {
        return fail('Staff code is required for train captains', 'rc');
    }
    if (n.length < 2) {
        return fail('Full name must be at least 2 characters', 'rn');
    }
    if (!/^\S+@\S+\.\S+$/.test(e)) {
        return fail('Invalid email format', 're');
    }
    if (DB.d.users.some(u => u.email == e)) {
        return fail('This email is already registered. Log in instead.', 're');
    }
    if (p.length < 6 || !/\d/.test(p)) {
        return fail('Password needs 6+ characters and at least one digit', 'rp');
    }
    if (r == 'captain' && c !== 'RAIL2026') {
        return fail('Invalid staff code. Captains need a valid code (demo: RAIL2026).', 'rc');
    }
    if (!$('#rt').checked) {
        return fail('You must accept the Terms of Service', 'rt');
    }
    const u = {
        id: DB.d.users.length + 1,
        full_name: n,
        email: e,
        hash: hashPw(DB.d.users.length + 1, p),
        role: r
    };
    DB.d.users.push(u);
    DB.save();
    toast('Account created');
    login(u);
}
//==== AUTHENTICATION AND VALIDATION ====

function doLogin() {
    S.err = null;
    const e = $('#le').value.trim().toLowerCase();
    const p = $('#lp').value;
    if (!e) {
        return fail('Email is required', 'le');
    }
    if (!p.trim()) {
        return fail('Password is required', 'lp');
    }
    if (!/^\S+@\S+\.\S+$/.test(e)) {
        return fail('Invalid email format (example: name@mail.com)', 'le');
    }
    // ENDTERM fix: failed attempts are saved in the database per account,
    // so reloading the page no longer removes the 30 s lock
    const lock = DB.d.locks[e] || { fails: 0, until: 0 };
    if (lock.until > Date.now()) {
        return fail('Too many attempts. Try again in ' + Math.ceil((lock.until - Date.now()) / 1000) + ' s', 'lp');
    }
    const u = DB.d.users.find(x => x.email == e);
    if (!u) {
        logEvent('security', 'Failed login: unknown email ' + e);
        return fail('No account found for this email. Create an account first.', 'le');
    }
    if (u.hash !== hashPw(u.id, p)) {
        lock.fails++;
        logEvent('security', 'Failed login (wrong password): ' + e);
        if (lock.fails >= 3) {
            lock.until = Date.now() + 30000;
            lock.fails = 0;
            DB.d.locks[e] = lock;
            logEvent('security', 'Account locked for 30 s: ' + e);
            return fail('Account locked for 30 s after 3 failed attempts', 'lp');
        }
        DB.d.locks[e] = lock;
        DB.save();
        return fail('Incorrect password. ' + (3 - lock.fails) + ' attempt(s) left', 'lp');
    }
    delete DB.d.locks[e];
    login(u);
}

// ENDTERM (user testing): test accounts are filled in with one tap
function demo(id) {
    S.err = null;
    $('#err').style.display = 'none';
    document.querySelectorAll('.bad').forEach(x => x.classList.remove('bad'));
    $('#le').value = id == 1 ? 'captain@railoperations.co' : 'passenger@mail.com';
    $('#lp').value = id == 1 ? 'captain123' : 'pass1234';
    toast('Test account filled in. Press Sign in');
}

function login(u) {
    logEvent('security', 'Sign-in: ' + u.email + ' (' + u.role + ')');
    DB.d.session = u.id;
    DB.save();
    S.user = u.full_name;
    S.email = u.email;
    S.role = u.role;
    toast('Signed in as ' + (u.role == 'captain' ? 'train captain' : 'passenger'));
    go('home');
}

// Shows a validation error. ENDTERM: the error is also kept in S.err,
// so it stays on the screen after the automatic refresh.
function fail(m, id) {
    S.err = { scr: S.scr, id, m };
    document.querySelectorAll('.bad').forEach(x => x.classList.remove('bad'));
    const el = $('#' + id);
    if (el) {
        el.classList.add('bad');
    }
    const b = $('#err');
    if (b) {
        b.innerHTML = '⚠ ' + esc(m);
        b.style.display = 'block';
        b.style.animation = 'none';
        b.offsetHeight;
        b.style.animation = '';
    }
    if (el && el.focus) {
        el.focus();
    }
    return false;
}

function deny() {
    logEvent('security', 'Access denied for role ' + S.role);
    toast('⛔ Access denied: train captains only');
}

function signOut() {
    DB.d.session = null;
    DB.save();
    S.role = null;
    S.cout = null;
    toast('Signed out');
    go('login');
}

function resetDB() {
    try {
        localStorage.removeItem('ecotrain_db');
    }
    catch (e) {
    }
    location.reload();
}

const SID = {
    co2: 'AQ-03',
    temp: 'T-03',
    hum: 'H-02',
    noise: 'N-01'
};

const MAXV = {
    co2: 10000,
    temp: 60,
    hum: 100,
    noise: 140
};

// SHA-256 (synchronous): passwords are hashed before they are stored
function sha256(text) {
    const K = [], H = [];
    for (let n = 2, count = 0; count < 64; n++) {
        let isPrime = true;
        for (let d = 2; d * d <= n; d++) {
            if (n % d === 0) {
                isPrime = false;
            }
        }
        if (isPrime) {
            if (count < 8) {
                H[count] = (Math.pow(n, 0.5) % 1 * 4294967296) | 0;
            }
            K[count++] = (Math.pow(n, 1 / 3) % 1 * 4294967296) | 0;
        }
    }
    const bytes = unescape(encodeURIComponent(text));
    const len = bytes.length, words = [];
    for (let i = 0; i < len; i++) {
        words[i >> 2] |= bytes.charCodeAt(i) << (24 - (i % 4) * 8);
    }
    words[len >> 2] |= 0x80 << (24 - (len % 4) * 8);
    words[(((len + 8) >> 6) + 1) * 16 - 1] = len * 8;
    let h = H.slice();
    for (let j = 0; j < words.length; j += 16) {
        const w = [];
        for (let i = 0; i < 64; i++) {
            if (i < 16) {
                w[i] = words[j + i] | 0;
            }
            else {
                const g0 = w[i - 15], g1 = w[i - 2];
                const s0 = (g0 >>> 7 | g0 << 25) ^ (g0 >>> 18 | g0 << 14) ^ (g0 >>> 3);
                const s1 = (g1 >>> 17 | g1 << 15) ^ (g1 >>> 19 | g1 << 13) ^ (g1 >>> 10);
                w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
            }
        }
        let [a, b, c, d, e, f, g, hh] = h;
        for (let i = 0; i < 64; i++) {
            const S1 = (e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7);
            const t1 = (hh + S1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
            const S0 = (a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10);
            const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
            hh = g; g = f; f = e; e = (d + t1) | 0;
            d = c; c = b; b = a; a = (t1 + t2) | 0;
        }
        h = [h[0] + a | 0, h[1] + b | 0, h[2] + c | 0, h[3] + d | 0, h[4] + e | 0, h[5] + f | 0, h[6] + g | 0, h[7] + hh | 0];
    }
    return h.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

// Salted hash: the salt is the user id, so equal passwords give different hashes
const hashPw = (userId, password) => sha256('ecotrain:' + userId + ':' + password);

// Name of the user who acknowledged an alert (looked up from acknowledged_by)
function ackName(alert) {
    const user = DB.d.users.find(u => u.id == alert.ack_by);
    return user ? user.full_name.split(' ')[0] : 'captain';
}

const DB = { d: null, load() {
        try {
            this.d = JSON.parse(localStorage.getItem('ecotrain_db'));
        }
        catch (e) {
            this.d = null;
        }
        if (!this.d || !this.d.users) {
            this.d = {
                users: [{
                        id: 1,
                        full_name: 'Alex Morgan',
                        email: 'captain@railoperations.co',
                        hash: hashPw(1, 'captain123'),
                        role: 'captain'
                    }, {
                        id: 2,
                        full_name: 'Sam Passenger',
                        email: 'passenger@mail.com',
                        hash: hashPw(2, 'pass1234'),
                        role: 'passenger'
                    }],
                trains: S.trains.map((t, i) => ({
                    id: i + 1,
                    code: t.c.split(' · ')[0],
                    car: t.c.split(' · ')[1],
                    route: t.a
                })),
                sensors: [{ id: 'T-03', train_id: 1, metric: 'temp' }, { id: 'H-02', train_id: 3, metric: 'hum' }, { id: 'AQ-03', train_id: 1, metric: 'co2' }, { id: 'AQ-05', train_id: 2, metric: 'co2' }, { id: 'N-01', train_id: 1, metric: 'noise' }],
                readings: [],
                alerts: []
            };
            this.save();
        }
        // migrate old plain-text passwords to salted hashes
        for (const u of this.d.users) {
            if (u.pw) {
                u.hash = hashPw(u.id, u.pw);
                delete u.pw;
            }
        }
        this.d.events = this.d.events || [];
        this.d.vent = this.d.vent || 'NORMAL';
        // ENDTERM: new fields (also added to a database saved by the Assignment 4 version)
        this.d.ventMode = this.d.ventMode || 'auto';
        this.d.locks = this.d.locks || {};
        this.d.rid = Math.max(this.d.rid || 0, ...this.d.readings.map(r => r.id));
        this.save();
    },
    save() {
        try {
            localStorage.setItem('ecotrain_db', JSON.stringify(this.d));
        }
        catch (e) {
        }
    } };
DB.load();
DB.d.custom = DB.d.custom || [];
S.trains.push(...DB.d.custom);
if (DB.d.settings) {
    S.tog = DB.d.settings.tog;
    S.units = DB.d.settings.units;
}
{
    const u = DB.d.users.find(x => x.id == DB.d.session);
    if (u) {
        S.user = u.full_name;
        S.email = u.email;
        S.role = u.role;
        S.scr = 'home';
    }
}
if (DB.d.alerts.length) {
    S.al = DB.d.alerts;
    S.al.forEach(a => {
        if (a.m && (a.t == 'watch' || a.t == 'critical')) {
            S.open[a.m] = a;
        }
    });
    S.nid = Math.max(10, ...S.al.map(a => a.id + 1));
}

const sensorConsole = () => `<h2>Sensor console <span class="chip">CAPTAIN</span></h2>
<div class="card">
<div class="mt" style="margin-bottom:6px">Send a test reading to the alert engine. Try sensor <b>XX-99</b> or value <b>-5</b> to see error handling.</div>
<input class="in" id="ss" placeholder="Sensor ID (AQ-03, T-03, H-02, N-01)" value="AQ-03">
<input class="in" id="sv" placeholder="Value, e.g. 1150">
<button class="btn" onclick="sendReading()">Send reading</button>${S.cout ? `<div class="errbox ${S.cout.ok ? 'okbox' : ''}">${S.cout.ok ? '✔ ' : '⚠ '}${esc(S.cout.msg)}</div>` : ''}</div>`;

function sendReading() {
    const id = $('#ss').value.trim().toUpperCase();
    const raw = $('#sv').value.trim();
    const sn = DB.d.sensors.find(x => x.id == id);
    const out = (ok, msg) => {
        S.cout = { ok, msg };
        render();
    };
    if (!id) {
        return out(0, 'Sensor ID is required');
    }
    if (!raw) {
        return out(0, 'Value is required. Reading rejected, nothing stored.');
    }
    if (!sn) {
        return out(0, 'ERROR: unknown sensor ' + id + '. Reading rejected, nothing stored.');
    }
    if (isNaN(+raw)) {
        return out(0, 'ERROR: "' + raw + '" is not a number. Reading rejected.');
    }
    const v = +raw;
    const m = sn.metric;
    if (v < 0) {
        return out(0, 'ERROR: invalid value ' + v + ' from ' + id + ' (must be ≥ 0). Reading rejected, nothing stored.');
    }
    if (v > MAXV[m]) {
        return out(0, 'ERROR: ' + v + ' ' + UN[m] + ' is above the sensor range (' + MAXV[m] + '). Reading rejected.');
    }
    S.r[m] = v;
    if (m == 'co2') {
        S.hold = v >= 900 ? 1 : 0;
    }
    ingest(m, v, 'console');
    // ENDTERM: a test reading from a sensor with an "offline" alert means it is back online
    const off = S.al.find(a => a.t == 'offline' && (a.msg || '').includes(id));
    if (off) {
        off.from = 'offline';
        off.t = 'resolved';
        off.title = 'Sensor ' + id + ' back online';
        off.res_at = Date.now();
        off.auto = true;
        delete off.rec;
        logEvent('auto', 'Sensor ' + id + ' back online, offline alert #' + off.id + ' resolved');
    }
    out(1, id + ' ' + v + ' ' + UN[m] + ' → ' + classify(m, v).toUpperCase() + '. Saved to readings table.' + (off ? ' Sensor back online.' : ''));
}

const dbCard = () => S.role != 'captain' ? `<div class="note">🔒 Database tools are available to train captains only</div>` : `<h2>Database <span class="chip">JSON · localStorage</span></h2>
<div class="card">
<div class="mt">Tables: users ${DB.d.users.length} · trains ${DB.d.trains.length} · sensors ${DB.d.sensors.length} · readings ${DB.d.readings.length} · alerts ${S.al.length}</div>${DB.d.readings.slice(-4).reverse().map(r => `<div class="mt" style="padding:3px 0;border-bottom:1px solid var(--ln)">#${r.id} · ${r.sensor_id} · ${r.value} · ${r.ts}</div>`).join('')}<button class="btn o" onclick="resetDB()">Reset database</button></div>`;
//==== PROFILE, TRAINS, REPORTS (create / update / delete) ====

function sig() {
    return S.al.map(a => a.id + a.t + a.read + (a.ack ? 1 : 0)).join();
}

function rf2() {
    const e0 = $('#hq');
    const f = e0.selectionStart;
    render();
    const e = $('#hq');
    e.focus();
    e.setSelectionRange(f, f);
}

function delAlert(id) {
    if (S.role != 'captain') {
        return deny();
    }
    logEvent('user', 'Alert #' + id + ' deleted by ' + S.user);
    S.al = S.al.filter(x => x.id != id);
    for (const k in S.open) {
        if (S.open[k] && S.open[k].id == id) {
            delete S.open[k];
        }
    }
    toast('Alert deleted from database');
    render();
}

const reportForm = () => `<h2>Report an issue <span class="chip">PASSENGER</span></h2>
<div class="card">
<div class="mt" style="margin-bottom:6px">Something wrong in your car? The crew will see it as an alert.</div>
<label>What is wrong?</label>
<select class="in" id="pc">${Object.keys(REPORT_ACTION).map(o => `<option>${o}</option>`).join('')}</select>
<label>Description (required)</label>
<input class="in" id="pm" placeholder="Describe the problem (5–120 characters)">
${errBox()}
<button class="btn" onclick="sendReport()">Send report</button></div>`;

// What the crew should do for each type of passenger report (used by the advisor)
const REPORT_ACTION = {
    'Air feels stuffy': 'Increase ventilation (HIGH) and check the CO₂ sensor',
    'Too hot': 'Increase cooling and check the temperature sensor',
    'Too cold': 'Increase heating and check the doors',
    'Too noisy': 'Check doors, windows and equipment noise'
};

function sendReport() {
    S.err = null;
    const c = $('#pc').value;
    const m = $('#pm').value.trim();
    // ENDTERM: required-field check with a message that names the missing value
    if (!m) {
        return fail('Description is required: please describe the problem', 'pm');
    }
    if (m.length < 5) {
        return fail('Description is too short (at least 5 characters)', 'pm');
    }
    if (m.length > 120) {
        return fail('Description is too long (max 120 characters)', 'pm');
    }
    const t = S.trains[S.tr];
    const p = t.c.split(' · ');
    // ENDTERM: duplicate prevention. The same open problem cannot be reported twice
    if (S.al.some(a => a.by == DB.d.session && a.cat == c && a.train == p[0] && isOpen(a))) {
        return fail('You already reported "' + c + '" for ' + t.c + '. The crew is working on it (see My reports).', 'pc');
    }
    const a = {
        id: S.nid++,
        t: 'watch',
        title: 'Passenger report: ' + c,
        msg: m,
        time: 'just now',
        created: Date.now(),
        train: p[0],
        car: p[1],
        read: false,
        rec: REPORT_ACTION[c],
        src: 'passenger',
        cat: c,
        by: DB.d.session
    };
    S.al.unshift(a);
    logEvent('user', 'Passenger report #' + a.id + ': ' + c + ' (' + t.c + ')');
    toast('Report saved and sent to the crew');
    render();
}

const editForm = () => `<div class="card"><b>Edit profile</b>
${errBox()}
<label>Full name</label>
<input class="in" id="pn" value="${esc(S.user)}">
<label>Email</label>
<input class="in" id="pe" value="${esc(S.email)}">
<button class="btn" onclick="saveProfile()">Save changes</button></div>`;

function saveProfile() {
    S.err = null;
    const n = $('#pn').value.trim();
    const e = $('#pe').value.trim().toLowerCase();
    if (!n) {
        return fail('Full name is required', 'pn');
    }
    if (!e) {
        return fail('Email is required', 'pe');
    }
    if (n.length < 2) {
        return fail('Full name must be at least 2 characters', 'pn');
    }
    if (!/^\S+@\S+\.\S+$/.test(e)) {
        return fail('Invalid email format', 'pe');
    }
    const me = DB.d.users.find(u => u.id == DB.d.session);
    if (DB.d.users.some(u => u.email == e && u !== me)) {
        return fail('This email is used by another account', 'pe');
    }
    me.full_name = n;
    me.email = e;
    DB.save();
    S.user = n;
    S.email = e;
    S.edit = false;
    toast('Profile saved to database');
    render();
}

const trainForm = () => `<div class="card"><b>Add train</b>
<input class="in" id="tc" placeholder="Train code (e.g. ICE 123)" style="margin-top:8px">
<input class="in" id="tn" placeholder="Car number (1–20)">
<input class="in" id="tr" placeholder="Route (e.g. Astana → Almaty)">
${errBox()}
<button class="btn" onclick="saveTrain()">Save train</button></div>`;

function saveTrain() {
    S.err = null;
    if (S.role != 'captain') {
        return deny();
    }
    const c = $('#tc').value.trim().toUpperCase();
    const n = $('#tn').value.trim();
    const r = $('#tr').value.trim();
    if (!c) {
        return fail('Train code is required', 'tc');
    }
    if (!n) {
        return fail('Car number is required', 'tn');
    }
    if (!r) {
        return fail('Route is required', 'tr');
    }
    if (!/^[A-Z]{1,3}\s?\d{1,4}$/.test(c)) {
        return fail('Train code format: letters + number, e.g. ICE 123', 'tc');
    }
    if (!/^\d+$/.test(n) || +n < 1 || +n > 20) {
        return fail('Car number must be a whole number from 1 to 20', 'tn');
    }
    const p = r.split(/\s*(?:→|->|-|–)\s*/);
    if (p.length != 2 || !p[0] || !p[1]) {
        return fail('Route must look like "Astana → Almaty"', 'tr');
    }
    const code = c.replace(/^([A-Z]+)\s?(\d+)$/, '$1 $2');
    const name = code + ' · Car ' + n;
    if (S.trains.some(t => t.c.toLowerCase() == name.toLowerCase())) {
        return fail('This train and car already exist', 'tc');
    }
    const t = {
        c: name,
        a: p[0] + ' → ' + p[1],
        d: 'Added just now',
        s: 100,
        ok: true,
        spd: 0,
        custom: 1,
        stops: [[p[0], 'Scheduled', '--:--', 2], [p[1], 'Scheduled', '--:--', 0]]
    };
    S.trains.push(t);
    DB.d.custom.push(t);
    // ENDTERM fix: the trains table is updated too (before only the screen list changed)
    DB.d.trains.push({ id: Math.max(0, ...DB.d.trains.map(x => x.id)) + 1, code, car: 'Car ' + n, route: t.a });
    logEvent('user', 'Train added: ' + name);
    DB.save();
    S.addT = false;
    toast('Train saved to database');
    render();
}

function delTrain(i) {
    if (S.role != 'captain') {
        return deny();
    }
    const t = S.trains[i];
    if (!t || !t.custom) {
        return;
    }
    S.trains.splice(i, 1);
    DB.d.custom = DB.d.custom.filter(x => x.c != t.c);
    DB.d.trains = DB.d.trains.filter(x => x.code + ' · ' + x.car != t.c);
    logEvent('user', 'Train deleted: ' + t.c);
    DB.save();
    if (S.tr >= S.trains.length) {
        S.tr = 0;
    }
    toast('Train deleted from database');
    render();
}
//==== ASSIGNMENT 4: SMART FUNCTION, DATA ANALYSIS, AUDIT LOG ====

// ---- Audit log: every important event is saved in DB.d.events (security + automatic actions)
function logEvent(kind, text) {
    DB.d.events.unshift({ id: Date.now() + Math.random(), at: Date.now(), kind, text });
    if (DB.d.events.length > 200) {
        DB.d.events.pop();
    }
    DB.save();
}

// ---- SMART FUNCTION 1: advisor
// Input: readings {co2, temp, hum, noise}  ->  Output: advice list, highest priority first
function advise(r) {
    const out = [];
    const add = (pri, issue, action) => out.push({ pri, issue, action });
    if (r.co2 >= 1000) {
        add(3, `CO₂ ${r.co2} ppm is critical`, 'Set ventilation to maximum and check the car now');
    }
    else if (r.co2 >= 900) {
        add(2, `CO₂ ${r.co2} ppm is rising`, 'Increase ventilation');
    }
    if (r.temp >= 28) {
        add(3, `Temperature ${r.temp} °C is critical`, 'Cool the car immediately');
    }
    else if (r.temp <= 16) {
        add(3, `Temperature ${r.temp} °C is critical`, 'Heat the car immediately');
    }
    else if (r.temp > 24) {
        add(2, `Temperature ${r.temp} °C is above comfort range`, 'Increase cooling');
    }
    else if (r.temp < 20) {
        add(2, `Temperature ${r.temp} °C is below comfort range`, 'Increase heating');
    }
    if (r.hum >= 70 || r.hum <= 20) {
        add(3, `Humidity ${r.hum} % is critical`, 'Check the ventilation and climate system');
    }
    else if (r.hum > 60) {
        add(2, `Humidity ${r.hum} % is high`, 'Reduce humidity: increase ventilation');
    }
    else if (r.hum < 30) {
        add(2, `Humidity ${r.hum} % is low`, 'Check the humidifier / climate settings');
    }
    if (r.noise >= 85) {
        add(3, `Noise ${r.noise} dB is critical`, 'Check for equipment faults');
    }
    else if (r.noise >= 70) {
        add(2, `Noise ${r.noise} dB is high`, 'Check noise sources and doors');
    }
    // combined rule: two problems together are more serious than each alone
    if (r.co2 >= 900 && r.temp > 24) {
        add(3, 'Stuffy and hot air together', 'Ventilation first, then cooling; consider moving passengers to another car');
    }
    if (!out.length) {
        add(1, 'All values are within comfort ranges', 'No action needed');
    }
    return out.sort((a, b) => b.pri - a.pri);
}

// Short action text used inside new alerts
const topAdvice = (m, v) => advise({ [m]: v })[0].action;

// ---- SMART FUNCTION 2: automatic action (ventilation level follows CO₂)
function autoVent(m, v) {
    if (m != 'co2') {
        return;
    }
    let level = v >= 1000 ? 'MAX' : v >= 900 ? 'HIGH' : 'NORMAL';
    // ENDTERM (decision from our A4 chart): before and during rush hours at least HIGH
    const early = level == 'NORMAL' && preRush();
    if (early) {
        level = 'HIGH';
    }
    // ENDTERM: in MANUAL mode the captain's choice is kept,
    // but the safety rule still switches to MAX at 1000 ppm or more
    if (DB.d.ventMode == 'manual' && (level != 'MAX' || DB.d.vent == 'MAX')) {
        return;
    }
    if (DB.d.vent !== level) {
        DB.d.vent = level;
        logEvent('auto', `Ventilation set to ${level} (${early ? 'rush-hour pre-ventilation' : 'CO₂ ' + v + ' ppm'})`);
        toast('Auto action: ventilation ' + level);
    }
}

// ---- ENDTERM (A4 decision 1): pre-ventilation before rush hours.
// Our A4 chart showed CO₂ above 900 ppm only in rush hours, so we start ventilation earlier:
// 06:30–10:00 and 15:30–19:00 the level is at least HIGH (AUTO mode).
function preRush() {
    if (S.simRush) {
        return true;        // demo button: simulate rush hour now
    }
    const d = new Date(), min = d.getHours() * 60 + d.getMinutes();
    return (min >= 390 && min < 600) || (min >= 930 && min < 1140);
}

function toggleRush() {
    if (S.role != 'captain') {
        return deny();
    }
    S.simRush = !S.simRush;
    logEvent('user', 'Rush-hour simulation ' + (S.simRush ? 'ON' : 'OFF') + ' (demo)');
    autoVent('co2', S.r.co2);
    render();
}

// ---- ENDTERM (A4 decision 2): reminder for offline sensors not handled for 15+ minutes
function offlineReminders() {
    return S.al.filter(a => a.t == 'offline' && !a.ack && a.created && Date.now() - a.created > 15 * 60000);
}

function checkReminders() {
    for (const a of offlineReminders()) {
        if (!a.reminded) {
            a.reminded = true;
            logEvent('auto', `Reminder: offline alert #${a.id} (${a.train}) not handled for ${Math.round((Date.now() - a.created) / 60000)} min`);
            if (S.role == 'captain') {
                toast('⏰ Reminder: offline sensor not handled');
            }
        }
    }
}

const reminderCard = () => {
    const R = offlineReminders();
    if (!R.length || S.role != 'captain') {
        return '';
    }
    return `<div class="card al off click" onclick="openInc(${R[0].id})"><b style="font-size:13px">⏰ Reminder: ${R.length} offline sensor alert${R.length > 1 ? 's' : ''} not handled for 15+ min</b>
${R.slice(0, 3).map(a => `<div class="mt">${esc(a.train)} · ${esc(a.title)} · ${ago(a)}</div>`).join('')}${R.length > 3 ? `<div class="mt">and ${R.length - 3} more</div>` : ''}
<div class="open">Check the sensor ›</div></div>`;
};

// ---- DATA ANALYSIS: everything is calculated from the saved readings and alerts
function analyse() {
    const metricOf = {};
    DB.d.sensors.forEach(s => metricOf[s.id] = s.metric);
    const stats = {};
    for (const m of ['co2', 'temp', 'hum', 'noise']) {
        stats[m] = { n: 0, sum: 0, min: Infinity, max: -Infinity, outside: 0 };
    }
    for (const r of DB.d.readings) {
        const st = stats[metricOf[r.sensor_id]];
        if (!st) {
            continue;
        }
        st.n++;
        st.sum += r.value;
        st.min = Math.min(st.min, r.value);
        st.max = Math.max(st.max, r.value);
        if (classify(metricOf[r.sensor_id], r.value) != 'ok') {
            st.outside++;
        }
    }
    const incidents = S.al.filter(a => a.t != 'info');
    const count = type => incidents.filter(a => a.t == type).length;
    const handled = incidents.filter(a => a.t == 'resolved' || a.ack).length;
    const byTrain = {};
    incidents.forEach(a => byTrain[a.train] = (byTrain[a.train] || 0) + 1);
    // ENDTERM calculation: average response time = from the alert to the first reaction
    // (acknowledge or resolve), only for incidents that have both times saved
    const times = incidents.map(respMs).filter(x => x != null);
    // CO₂ chart data + findings (sensor AQ-03, sorted by time)
    const co2 = DB.d.readings.filter(r => r.sensor_id == 'AQ-03').sort((a, b) => a.at - b.at);
    const peak = co2.reduce((best, r) => !best || r.value > best.value ? r : best, null);
    return {
        avgResp: times.length ? times.reduce((a, b) => a + b, 0) / times.length / 60000 : null,
        respN: times.length,
        open: incidents.filter(isOpen).length,
        co2,
        peak,
        co2High: co2.length ? Math.round(co2.filter(r => r.value >= 900).length / co2.length * 100) : 0,
        stats,
        totalReadings: DB.d.readings.length,
        totalIncidents: incidents.length,
        byType: { watch: count('watch'), critical: count('critical'), offline: count('offline'), resolved: count('resolved') },
        resolvedPct: incidents.length ? Math.round(count('resolved') / incidents.length * 100) : 0,
        handledPct: incidents.length ? Math.round(handled / incidents.length * 100) : 0,
        byTrain
    };
}

// ---- Simulated history (clearly marked) so that the analysis has enough data
function genHistory() {
    if (S.role != 'captain') {
        return deny();
    }
    const now = Date.now();
    const base = { co2: [600, 300, 150], temp: [22, 2.5, 1.5], hum: [45, 6, 10], noise: [55, 10, 8] };
    // ENDTERM fix: ids come from the saved counter, so they are never repeated
    let id = DB.d.rid || 0;
    for (const m of ['co2', 'temp', 'hum', 'noise']) {
        for (let i = 0; i < 60; i++) {
            const at = now - (60 - i) * 12 * 60000;
            const hour = new Date(at).getHours();
            const rush = (hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 18) ? 1 : 0;
            const [b, r, n] = base[m];
            const value = b + rush * r + Math.random() * n;
            DB.d.readings.push({
                id: ++id, sensor_id: SID[m], value: m == 'temp' ? +value.toFixed(1) : Math.round(value),
                ts: new Date(at).toLocaleTimeString(), at, src: 'sim-history'
            });
        }
    }
    DB.d.rid = id;
    DB.d.readings.sort((x, y) => x.at - y.at);
    const types = ['watch', 'critical', 'resolved', 'resolved', 'resolved', 'offline'];
    const trains = ['EC 204', 'ICE 709', 'RJ 1035'];
    for (let i = 0; i < 9; i++) {
        const t = types[Math.floor(Math.random() * types.length)];
        const train = trains[Math.floor(Math.random() * trains.length)];
        const created = now - Math.round(Math.random() * 11 * 3600000) - 3600000;
        const reaction = created + Math.round((3 + Math.random() * 22) * 60000);   // 3–25 min later
        S.al.push({
            id: S.nid++, t, title: `Simulated ${t} incident`, msg: 'Simulated history for the analysis.',
            time: 'earlier today', created, train, read: true, sim: true, rec: 'Check the car',
            res_at: t == 'resolved' ? reaction : undefined, note: t == 'resolved' ? 'Simulated: checked the car' : undefined
        });
    }
    logEvent('user', 'Simulated history generated (240 readings, 9 incidents)');
    toast('Simulated history added');
    render();
}

function clearHistory() {
    if (S.role != 'captain') {
        return deny();
    }
    DB.d.readings = DB.d.readings.filter(r => r.src != 'sim-history');
    S.al = S.al.filter(a => !a.sim);
    logEvent('user', 'Simulated history cleared');
    toast('Simulated history removed');
    render();
}

// ---- Download the saved data as CSV (to build the chart later in Excel / Python)
function download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    a.download = name;
    a.click();
}

// ENDTERM fix: export LOCAL time (before: UTC "…Z"). The app finds rush hours in local time,
// so with UTC the Python rush-hour result was shifted by 5 hours in Astana.
const localTime = t => {
    const d = new Date(t), z = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
};

function exportCSV(which) {
    if (S.role != 'captain') {
        return deny();
    }
    const metricOf = {};
    DB.d.sensors.forEach(s => metricOf[s.id] = s.metric);
    if (which == 'readings') {
        const rows = DB.d.readings.map(r => [r.id, r.sensor_id, metricOf[r.sensor_id], r.value, localTime(r.at || 0), r.src || 'sim'].join(','));
        download('readings.csv', 'id,sensor_id,metric,value,time,source\n' + rows.join('\n'));
    }
    else {
        const q = t => '"' + String(t || '').replace(/"/g, '""') + '"';
        const rows = S.al.filter(a => a.t != 'info').map(a => [a.id, a.t, q(a.title), a.train, a.ack ? 'yes' : 'no', a.sim ? 'simulated' : a.src == 'passenger' ? 'passenger' : 'live',
            a.created ? localTime(a.created) : '', respMs(a) != null ? (respMs(a) / 60000).toFixed(1) : '', q(a.note)].join(','));
        download('alerts.csv', 'id,type,title,train,acknowledged,source,created,response_min,action_taken\n' + rows.join('\n'));
    }
    logEvent('user', 'Exported ' + which + '.csv');
}

// ---- What-if form: user enters values -> advisor gives advice
function runWhatIf(preset) {
    S.err = null;
    if (preset) {
        S.wiv = { ...preset };
    }
    const v = S.wiv || {};
    const fields = [['co2', 'wc', 'CO₂', 0, 10000], ['temp', 'wt', 'Temperature', -30, 60], ['hum', 'wh', 'Humidity', 0, 100], ['noise', 'wn', 'Noise', 0, 140]];
    const input = {};
    for (const [key, id, label, min, max] of fields) {
        const raw = String(v[key] ?? '').trim();
        if (raw === '') {
            continue;
        }
        if (isNaN(+raw)) {
            return fail(label + ' must be a number', id);
        }
        if (+raw < min || +raw > max) {
            return fail(`${label} must be between ${min} and ${max}`, id);
        }
        input[key] = +raw;
    }
    if (!Object.keys(input).length) {
        return fail('Enter at least one value', 'wc');
    }
    S.wi = { input, advice: advise(input) };
    render();
}

const priChip = p => p == 3 ? '<span class="chip r">HIGH</span>' : p == 2 ? '<span class="chip w">MEDIUM</span>' : '<span class="chip">OK</span>';
const adviceList = list => list.map(a => `<div class="adv">
<div class="row sp"><b style="font-size:12px">${a.issue}</b>${priChip(a.pri)}</div>
<div class="mt">→ ${a.action}</div></div>`).join('');

// ---- Insights screen
function insightsScreen() {
    const A = analyse(), cap = S.role == 'captain', wv = S.wiv || {};
    const vent = DB.d.vent || 'NORMAL';
    const ventChip = vent == 'MAX' ? 'r' : vent == 'HIGH' ? 'w' : '';
    const autos = DB.d.events.filter(e => e.kind == 'auto').slice(0, 4);
    const rows = ['co2', 'temp', 'hum', 'noise'].map(m => {
        const s = A.stats[m];
        return s.n ? `<tr><td>${NM[m]}</td><td>${s.n}</td><td>${(s.sum / s.n).toFixed(1)}</td><td>${s.min}</td><td>${s.max}</td><td>${Math.round(s.outside / s.n * 100)}%</td></tr>` : `<tr><td>${NM[m]}</td><td colspan="5" class="mt">no data</td></tr>`;
    }).join('');
    const trainRows = Object.keys(A.byTrain).map(k => `<tr><td>${esc(k)}</td><td>${A.byTrain[k]}</td></tr>`).join('');
    const top = Object.keys(A.byTrain).sort((a, b) => A.byTrain[b] - A.byTrain[a])[0];
    const field = (key, id, ph) => `<input class="in" id="${id}" placeholder="${ph}" value="${esc(wv[key])}" oninput="S.wiv=S.wiv||{};S.wiv.${key}=this.value">`;
    return `${hdr('Insights', 'Smart advisor and data analysis · simulated data', '')}
<div class="card dk"><div class="row sp"><div><div class="mt">Ventilation · ${(DB.d.ventMode || 'auto').toUpperCase()} mode</div><b style="font-size:17px">Ventilation: ${vent}</b></div><span class="chip ${ventChip}">${vent}</span></div>
<div class="mt" style="margin-top:6px">AUTO: set from the CO₂ reading (≥ 900 HIGH, ≥ 1000 MAX). The level also lowers the simulated CO₂.</div>
<div class="mt" style="margin-top:4px">Rush-hour pre-ventilation 06:30–10:00 and 15:30–19:00: at least HIGH. Now: <b style="color:#fff">${preRush() ? 'ACTIVE' : 'not active'}</b>${S.simRush ? ' (simulated)' : ''}</div>
${cap ? `<button class="btn o vb ${S.simRush ? 'on' : ''}" style="width:100%;margin-top:8px" onclick="toggleRush()">Simulate rush hour (demo): ${S.simRush ? 'ON' : 'OFF'}</button>` : ''}
${autos.map(e => `<div class="mt">• ${new Date(e.at).toLocaleTimeString()} ${esc(e.text)}</div>`).join('')}${cap ? ventButtons() : ''}</div>
<h2>Smart advisor · live car EC 204 · Car 3</h2>
<div class="card">${adviceList(advise(S.r))}</div>
<h2>What-if check <span class="chip">TRY IT</span></h2>
<div class="card"><div class="mt" style="margin-bottom:6px">Enter values (any of them) and get advice.</div>
<div class="grid">${field('co2', 'wc', 'CO₂ ppm')}${field('temp', 'wt', 'Temp °C')}${field('hum', 'wh', 'Humidity %')}${field('noise', 'wn', 'Noise dB')}</div>
${errBox()}
<button class="btn" onclick="runWhatIf()">Get advice</button>
<div class="grid"><button class="btn o" onclick="runWhatIf({co2:1100,temp:29,hum:'',noise:''})">Crowded, hot car</button><button class="btn o" onclick="runWhatIf({co2:650,temp:22,hum:'',noise:''})">Comfortable car</button></div>
${S.wi ? `<div class="mt" style="margin:8px 0 4px">Advice for your input:</div>${adviceList(S.wi.advice)}` : ''}</div>
<h2>Data analysis <span class="chip">SIMULATED DATA</span></h2>
<div class="card"><div class="mt">Calculated from ${A.totalReadings} saved readings and ${A.totalIncidents} incidents.</div>
<table class="tbl"><tr><th>Metric</th><th>n</th><th>Avg</th><th>Min</th><th>Max</th><th>Outside</th></tr>${rows}</table></div>
<div class="card"><b style="font-size:13px">Incidents</b>
<div class="grid" style="margin:8px 0"><div><div class="mt">Handled (resolved or acknowledged)</div><div class="big">${A.handledPct}%</div></div><div><div class="mt">Average response time</div><div class="big">${A.avgResp == null ? '–' : A.avgResp.toFixed(1)}<span style="font-size:12px;color:var(--mt)"> min</span></div><div class="mt">from ${A.respN} incidents</div></div></div>
<div class="mt">Resolved ${A.resolvedPct}% · open now ${A.open} · by type: ${A.byType.watch} watch · ${A.byType.critical} critical · ${A.byType.offline} offline · ${A.byType.resolved} resolved</div>
<table class="tbl"><tr><th>Train</th><th>Incidents</th></tr>${trainRows || '<tr><td colspan="2" class="mt">no incidents</td></tr>'}</table></div>
<h2>Charts <span class="chip">LIVE FROM DATABASE</span></h2>
<div class="card"><b style="font-size:13px">CO₂ in EC 204 · Car 3 over time</b>
<div class="mt" style="margin-bottom:4px">${A.co2.length} saved readings of sensor AQ-03 · dashed lines: watch 900, critical 1000 ppm</div>
${co2Chart(A.co2, 300, 150)}
${A.co2.length ? `<div class="mt" style="margin-top:6px">Finding: ${A.co2High}% of CO₂ readings were at or above the 900 ppm watch limit; peak ${A.peak.value} ppm at ${hhmm(A.peak.at)}.</div>` : ''}</div>
<div class="card"><b style="font-size:13px">Incidents per train</b>
<div class="mt" style="margin-bottom:4px">All incidents in the alerts table (simulated + live)</div>
${trainChart(A.byTrain)}
${top ? `<div class="mt" style="margin-top:6px">Finding: ${esc(top)} has the most incidents (${A.byTrain[top]} of ${A.totalIncidents}). Decision: inspect this train first.</div>` : ''}</div>
${cap ? `<h2>Data tools <span class="chip">CAPTAIN</span></h2><div class="card">
<div class="grid"><button class="btn o" onclick="genHistory()">Add simulated history</button><button class="btn o" onclick="clearHistory()">Remove simulated</button></div>
<div class="grid"><button class="btn o" onclick="exportCSV('readings')">Download readings.csv</button><button class="btn o" onclick="exportCSV('alerts')">Download alerts.csv</button></div>
<button class="btn" onclick="shiftReport()">⬇ Download shift report</button></div>
<h2>Audit log <span class="chip">SECURITY</span></h2><div class="card">${DB.d.events.slice(0, 6).map(e => `<div class="mt" style="padding:2px 0">${new Date(e.at).toLocaleTimeString()} · <b>${e.kind}</b> · ${esc(e.text)}</div>`).join('') || '<div class="mt">No events yet</div>'}</div>` : '<div class="note">🔒 Data tools and audit log are available to train captains only</div>'}`;
}

//==== ENDTERM: INCIDENT HANDLING (connected scenario) ====

const isOpen = a => ['watch', 'critical', 'offline'].includes(a.t);
const alCls = a => a.t == 'offline' ? 'off' : a.t == 'resolved' ? 'res' : a.t;
const typeChip = a => `<span class="chip ${a.t == 'watch' ? 'w' : a.t == 'resolved' || a.t == 'info' ? '' : 'r'}">${a.t.toUpperCase()}</span>`;
const hhmm = t => new Date(t).toTimeString().slice(0, 5);

function userName(id) {
    const u = DB.d.users.find(x => x.id == id);
    return u ? u.full_name : 'captain';
}

// Response time in ms: from the alert until the first reaction (acknowledge or resolve)
function respMs(a) {
    const first = Math.min(a.ack_ms || Infinity, a.res_at || Infinity);
    return a.created && first != Infinity ? first - a.created : null;
}

// Error box that survives the automatic refresh (S.err is set by fail())
const errBox = () => S.err && S.err.scr == S.scr ? `<div id="err" class="errbox">⚠ ${esc(S.err.m)}</div>` : '<div id="err" class="errbox" style="display:none"></div>';

// One alert in the list. The whole card opens the incident screen (bigger target than the old link)
const alertCard = a => `<div class="card al click ${alCls(a)}" style="${a.read ? 'opacity:.85' : ''}" onclick="openInc(${a.id})">
<div class="row sp"><b style="font-size:13px">${esc(a.title)}${a.read ? '' : ' <span style="color:var(--rd)">●</span>'}</b>${typeChip(a)}</div>
<div class="mt" style="margin:4px 0">${esc(a.msg)}</div>${a.rec && !a.ack && a.t != 'resolved' ? `<div style="font-size:11px;color:var(--g);font-weight:600">→ Recommended: ${esc(a.rec)}</div>` : ''}${a.note ? `<div style="font-size:11px;color:var(--g);font-weight:600">✔ Action taken: ${esc(a.note)}</div>` : ''}
<div class="row sp mt" style="margin-top:6px"><span>${ago(a)} • ${esc(a.train)}${a.car ? ' · ' + esc(a.car) : ''} ${S.role == 'captain' ? `<button class="lk" style="color:var(--rd)" onclick="event.stopPropagation();delAlert(${a.id})">Delete</button>` : ''}</span>${isOpen(a) ? (a.ack ? `<span class="chip">ACK by ${esc(ackName(a))} ${a.ack_at || ''}</span>` : `<button class="lk" onclick="event.stopPropagation();ack(${a.id})">Acknowledge</button>`) : ''}</div>
${a.t != 'info' ? `<div class="open">${S.role == 'captain' && isOpen(a) ? 'Open and resolve ›' : 'Details ›'}</div>` : ''}</div>`;

function openInc(id) {
    const a = S.al.find(x => x.id == id);
    if (!a) {
        return;
    }
    a.read = true;
    S.inc = id;
    S.note = '';
    go('incident');
}

// Passenger sees what happened to their own reports (result of the scenario for the passenger)
function myReports() {
    const mine = S.al.filter(a => a.src == 'passenger' && a.by == DB.d.session);
    if (!mine.length) {
        return '';
    }
    return `<h2>My reports</h2><div class="card">${mine.map(a => `<div class="adv click" onclick="openInc(${a.id})"><div class="row sp"><b style="font-size:12px">${esc(a.cat)} · ${esc(a.train)} ${esc(a.car || '')}</b>${a.t == 'resolved' ? '<span class="chip">RESOLVED</span>' : a.ack ? '<span class="chip w">SEEN BY CREW</span>' : '<span class="chip r">SENT</span>'}</div>
<div class="mt">${a.t == 'resolved' ? '✔ Crew: ' + esc(a.note || 'resolved') : a.ack ? 'The crew is working on it' : 'Waiting for the crew · ' + ago(a)}</div></div>`).join('')}</div>`;
}

const statusChip = m => {
    const l = classify(m, S.r[m]);
    return `<span class="chip ${l == 'critical' ? 'r' : l == 'watch' ? 'w' : ''}">${l == 'ok' ? 'OK' : l.toUpperCase()}</span>`;
};

// Does the live sensor confirm the problem?
function sensorVerdict(a) {
    const m = a.m || { 'Air feels stuffy': 'co2', 'Too hot': 'temp', 'Too cold': 'temp', 'Too noisy': 'noise' }[a.cat];
    if (!m) {
        return 'No sensor is linked to this incident type.';
    }
    const l = classify(m, S.r[m]);
    return l == 'ok' ? `Sensor ${SID[m]} shows ${S.r[m]} ${UN[m]}: within the normal range now.`
        : `Confirmed by sensor ${SID[m]}: ${NM[m]} ${S.r[m]} ${UN[m]} (${l.toUpperCase()}).`;
}

// Advice for this incident: passenger report rule + the A4 advisor on the live readings
function incAdvice(a) {
    const list = a.train == 'EC 204' ? advise(S.r) : [];
    if (a.cat) {
        list.unshift({ pri: 2, issue: 'Passenger report: ' + a.cat, action: REPORT_ACTION[a.cat] });
    }
    else if (a.t == 'offline') {
        list.unshift({ pri: 2, issue: 'Sensor stopped reporting', action: 'Check the sensor wiring and power' });
    }
    else if (!list.length && a.rec) {
        list.push({ pri: a.t == 'critical' ? 3 : 2, issue: a.title, action: a.rec });
    }
    return (list.length > 1 ? list.filter(x => x.pri > 1) : list).sort((x, y) => y.pri - x.pri);
}

// Recommended ventilation level for an incident (rule-based)
function recVent(a) {
    if (S.r.co2 >= 1000 || (a.m == 'co2' && a.t == 'critical')) {
        return 'MAX';
    }
    if (S.r.co2 >= 900 || ['co2', 'hum', 'temp'].includes(a.m) || ['Air feels stuffy', 'Too hot'].includes(a.cat)) {
        return 'HIGH';
    }
    return 'NORMAL';
}

const ventButtons = () => `<div class="grid" style="grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px">${['AUTO', 'NORMAL', 'HIGH', 'MAX'].map(l => {
    const on = l == 'AUTO' ? DB.d.ventMode != 'manual' : DB.d.ventMode == 'manual' && DB.d.vent == l;
    return `<button class="btn o vb ${on ? 'on' : ''}" onclick="setVent('${l}')">${l}</button>`;
}).join('')}</div>`;

// Manual ventilation control (captain). AUTO gives control back to the CO₂ rule.
function setVent(level) {
    if (S.role != 'captain') {
        return deny();
    }
    if (level == 'AUTO') {
        DB.d.ventMode = 'auto';
        logEvent('user', 'Ventilation back to AUTO by ' + S.user);
        autoVent('co2', S.r.co2);
    }
    else {
        DB.d.ventMode = 'manual';
        DB.d.vent = level;
        logEvent('user', `Ventilation set to ${level} manually by ${S.user}`);
    }
    toast('Ventilation: ' + (level == 'AUTO' ? 'AUTO (' + DB.d.vent + ')' : level));
    render();
}

// "Apply recommended action": the captain confirms the advice in one tap
function applyAction(id) {
    if (S.role != 'captain') {
        return deny();
    }
    const a = S.al.find(x => x.id == id);
    const level = recVent(a);
    setVent(level);
    if (!a.ack) {
        a.ack = true;
        a.ack_by = DB.d.session;
        a.ack_at = new Date().toLocaleTimeString();
        a.ack_ms = Date.now();
    }
    S.note = S.note || 'Ventilation set to ' + level;
    logEvent('user', `Incident #${id}: recommended action applied (ventilation ${level})`);
    render();
}

// Close the incident with a required note about the action taken
function resolveInc(id) {
    S.err = null;
    if (S.role != 'captain') {
        return deny();
    }
    const a = S.al.find(x => x.id == id);
    const note = $('#an').value.trim();
    if (!note) {
        return fail('Action taken is required: write what you did before closing', 'an');
    }
    if (note.length < 5) {
        return fail('Action taken is too short (at least 5 characters)', 'an');
    }
    if (note.length > 200) {
        return fail('Action taken is too long (max 200 characters)', 'an');
    }
    // safety rule: the incident cannot be closed while its sensor value is still outside normal
    // (for a "stuffy air" report the linked sensor is CO₂)
    const m = a.m || (a.cat == 'Air feels stuffy' ? 'co2' : null);
    if (a.t != 'resolved' && m && a.train == 'EC 204' && classify(m, S.r[m]) != 'ok') {
        return fail(`${NM[m]} is still ${S.r[m]} ${UN[m]} (${classify(m, S.r[m]).toUpperCase()}). Wait until the ventilation brings it back to normal.`, 'an');
    }
    if (a.t == 'resolved') {
        // auto-resolved incident: the captain only adds what was done
        a.note = note;
        a.res_by = DB.d.session;
        S.note = '';
        logEvent('user', `Incident #${id}: note added by ${S.user}: ${note}`);
        toast('Note saved');
        return render();
    }
    a.from = a.t;
    a.t = 'resolved';
    a.note = note;
    a.res_by = DB.d.session;
    a.res_at = Date.now();
    a.read = true;
    if (!a.ack) {
        a.ack = true;
        a.ack_by = DB.d.session;
        a.ack_at = new Date().toLocaleTimeString();
        a.ack_ms = a.res_at;
    }
    for (const k in S.open) {
        if (S.open[k] && S.open[k].id == id) {
            delete S.open[k];
        }
    }
    S.note = '';
    logEvent('user', `Incident #${id} resolved by ${S.user}: ${note}`);
    toast('Incident resolved and saved');
    render();
}

// Shift report: a text file built from the same analysis
function shiftReport() {
    if (S.role != 'captain') {
        return deny();
    }
    const A = analyse();
    const inc = S.al.filter(a => a.t != 'info');
    const lines = [
        'ECOTRAIN SHIFT REPORT (simulated data)',
        'Created: ' + new Date().toLocaleString() + ' by ' + S.user,
        '',
        'Readings saved: ' + A.totalReadings,
        ...['co2', 'temp', 'hum', 'noise'].filter(m => A.stats[m].n).map(m => `  ${NM[m]}: avg ${(A.stats[m].sum / A.stats[m].n).toFixed(1)} ${UN[m]}, min ${A.stats[m].min}, max ${A.stats[m].max}, outside normal ${Math.round(A.stats[m].outside / A.stats[m].n * 100)}%`),
        '',
        `Incidents: ${A.totalIncidents} · handled ${A.handledPct}% · open ${A.open}`,
        'Average response time: ' + (A.avgResp == null ? 'no data' : A.avgResp.toFixed(1) + ' min'),
        '',
        'Resolved incidents:',
        ...inc.filter(a => a.t == 'resolved' && !a.sim).map(a => `  #${a.id} ${a.train} ${a.car || ''}: ${a.title}. Action: ${a.note || 'auto-resolved'}`),
        '',
        'Ventilation now: ' + DB.d.vent + ' (' + DB.d.ventMode + ')'
    ];
    download('shift_report.txt', lines.join('\n'));
    logEvent('user', 'Shift report downloaded');
}

// ---- Charts drawn as SVG from the saved data (they change when the data changes)
function co2Chart(pts, W, H) {
    if (pts.length < 2) {
        return '<div class="mt">Not enough CO₂ readings yet. Send a reading or add simulated history.</div>';
    }
    const L = 34, R = 8, T = 8, B = 30;
    const t0 = pts[0].at, t1 = pts[pts.length - 1].at;
    const vals = pts.map(p => p.value);
    const vmax = Math.max(1100, ...vals) + 50, vmin = Math.min(500, ...vals) - 50;
    const x = t => L + (t - t0) / (t1 - t0 || 1) * (W - L - R);
    const y = v => T + (vmax - v) / (vmax - vmin) * (H - T - B);
    const path = pts.map((p, i) => (i ? 'L' : 'M') + x(p.at).toFixed(1) + ' ' + y(p.value).toFixed(1)).join(' ');
    const grid = [600, 800, 1000, 1200, 1400, 1600].filter(v => v > vmin && v < vmax);
    const ticks = [0, 1, 2, 3].map(i => t0 + (t1 - t0) * i / 3);
    return `<svg viewBox="0 0 ${W} ${H}" class="chart">
${grid.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#e3ebe6"/><text x="${L - 4}" y="${y(v) + 3}" text-anchor="end">${v}</text>`).join('')}
<line x1="${L}" x2="${W - R}" y1="${y(900)}" y2="${y(900)}" stroke="#d98a1f" stroke-dasharray="4 3"/>
<line x1="${L}" x2="${W - R}" y1="${y(1000)}" y2="${y(1000)}" stroke="#d94c4c" stroke-dasharray="4 3"/>
<path d="${path}" fill="none" stroke="#2f7d5b" stroke-width="1.6"/>
${ticks.map(t => `<text x="${x(t)}" y="${H - B + 13}" text-anchor="middle">${t1 - t0 < 600000 ? new Date(t).toTimeString().slice(0, 8) : hhmm(t)}</text>`).join('')}
<text x="${(L + W - R) / 2}" y="${H - 3}" text-anchor="middle">Time</text>
<text x="9" y="${(T + H - B) / 2}" text-anchor="middle" transform="rotate(-90 9 ${(T + H - B) / 2})">CO₂, ppm</text>
</svg>`;
}

function trainChart(byTrain) {
    const keys = Object.keys(byTrain).sort((a, b) => byTrain[b] - byTrain[a]);
    if (!keys.length) {
        return '<div class="mt">No incidents yet.</div>';
    }
    const max = Math.max(...keys.map(k => byTrain[k]));
    const W = 300, rowH = 22, L = 64;
    return `<svg viewBox="0 0 ${W} ${keys.length * rowH + 18}" class="chart">
${keys.map((k, i) => `<text x="${L - 6}" y="${i * rowH + 15}" text-anchor="end">${esc(k)}</text>
<rect x="${L}" y="${i * rowH + 4}" width="${(W - L - 30) * byTrain[k] / max}" height="14" rx="3" fill="${i == 0 ? '#ee6a50' : '#f6a65a'}"/>
<text x="${L + (W - L - 30) * byTrain[k] / max + 5}" y="${i * rowH + 15}">${byTrain[k]}</text>`).join('')}
<text x="${(L + W) / 2}" y="${keys.length * rowH + 14}" text-anchor="middle">Number of incidents</text>
</svg>`;
}

//==== START THE APP ====
render();
setInterval(() => {
    if (S.tog.sync) {
        jit();
        checkReminders();
        if (['home', 'temp', 'air', 'other', 'alerts', 'incident', 'insights'].includes(S.scr) && !document.activeElement.matches('select') && (S.scr != 'alerts' || sig() != S.sg)) {
            refresh();
        }
    }
}, 4000);