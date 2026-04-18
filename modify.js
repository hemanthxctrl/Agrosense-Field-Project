const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');

const loginStyles = `
        /* ══════════════════════════════════════════
           LOGIN PAGE
        ══════════════════════════════════════════ */
        #page-login {
            min-height: 100vh;
            align-items: center;
            justify-content: center;
            position: relative;
            overflow: hidden;
            background: var(--bg);
        }

        .login-orb {
            position: absolute;
            border-radius: 50%;
            filter: blur(90px);
            pointer-events: none;
            animation: drift 14s ease-in-out infinite alternate;
        }
        .login-orb-1 { width: 600px; height: 600px; top: -180px; left: -180px; background: rgba(91,206,122,0.07); }
        .login-orb-2 { width: 500px; height: 500px; bottom: -160px; right: -160px; background: rgba(181,229,80,0.05); animation-delay: -6s; }

        .login-card {
            position: relative;
            z-index: 2;
            width: 440px;
            max-width: calc(100vw - 32px);
            background: rgba(11,22,11,0.75);
            backdrop-filter: blur(24px);
            border: 1px solid rgba(91,206,122,0.18);
            border-radius: 24px;
            padding: 44px 40px 40px;
            box-shadow: 0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(91,206,122,0.06);
            animation: fadeUp 0.7s ease both;
        }

        .login-logo {
            display: flex; align-items: center; gap: 12px; margin-bottom: 28px; justify-content: center;
        }
        .login-logo-icon {
            width: 44px; height: 44px; background: linear-gradient(135deg, var(--green), var(--lime));
            border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 22px;
        }
        .login-logo-text {
            font-family: var(--font-h); font-size: 26px; font-weight: 900;
            background: linear-gradient(90deg, var(--green), var(--lime));
            -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }

        .login-heading { font-family: var(--font-h); font-size: 22px; font-weight: 700; color: var(--cream); text-align: center; margin-bottom: 6px; }
        .login-sub { font-size: 12px; color: var(--muted); text-align: center; margin-bottom: 32px; font-family: var(--mono); }
        .login-field { margin-bottom: 18px; }
        .login-field label { display: block; font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; font-family: var(--mono); }
        .login-input { width: 100%; padding: 12px 14px; background: rgba(255,255,255,0.04); border: 1px solid var(--border); border-radius: 10px; color: var(--cream); font-family: var(--mono); font-size: 13px; outline: none; transition: all 0.2s; }
        .login-input:focus { border-color: rgba(91,206,122,0.5); background: rgba(91,206,122,0.04); box-shadow: 0 0 0 3px rgba(91,206,122,0.08); }
        .login-btn-submit { width: 100%; padding: 13px; border-radius: 10px; background: linear-gradient(135deg, var(--green), var(--lime)); color: #060d06; font-weight: 800; font-size: 14px; border: none; cursor: pointer; transition: all 0.25s; }
        .login-btn-submit:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(91,206,122,0.4); }
        
        .login-error { display: none; background: rgba(248,113,113,0.08); border: 1px solid rgba(248,113,113,0.25); border-radius: 8px; padding: 10px 14px; font-size: 12px; color: #f87171; margin-bottom: 16px; font-family: var(--mono); text-align: center; }
        .login-error.show { display: block; }
        .shake { animation: shake 0.4s ease; }
        @keyframes shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-8px); } 75% { transform: translateX(8px); } }
`;

const routingTargetRegex = /#page-landing\s*{\s+display:\s*block;\s*}\s*#page-dashboard\s*{\s+display:\s*none;\s*}\s*body\.dashboard-view\s+#page-landing\s*{\s+display:\s*none;\s*}\s*body\.dashboard-view\s+#page-dashboard\s*{\s+display:\s*flex;\s*}/;

const routingReplacement = `
        /* Login shows first by default */
        #page-login { display: flex; }
        #page-landing { display: none; }
        #page-dashboard { display: none; }

        /* After successful login */
        body.logged-in #page-login    { display: none; }
        body.logged-in #page-landing  { display: block; }

        /* Dashboard view */
        body.dashboard-view #page-login    { display: none; }
        body.dashboard-view #page-landing  { display: none; }
        body.dashboard-view #page-dashboard { display: flex; }`;

html = html.replace(routingTargetRegex, routingReplacement);
html = html.replace('</style>', loginStyles + '\n    </style>');

const loginHTML = `
    <div id="page-login">
        <div class="login-orb login-orb-1"></div>
        <div class="login-orb login-orb-2"></div>
        <div class="login-card">
            <div class="login-logo">
                <div class="login-logo-icon">🌱</div>
                <div class="login-logo-text">AgroSense</div>
            </div>
            <div class="login-heading">Farmer Portal</div>
            <div class="login-sub">Sign in to access your farm dashboard</div>
            
            <div class="login-error" id="login-error">Invalid credentials. Try again.</div>
            
            <form onsubmit="handleLogin(event)">
                <div class="login-field">
                    <label>Email Address</label>
                    <input type="text" id="login-email" class="login-input" placeholder="farmer@agrosense.io" value="farmer@agrosense.io" />
                </div>
                <div class="login-field">
                    <label>Password</label>
                    <input type="password" id="login-pw" class="login-input" placeholder="••••••••" value="demo123" />
                </div>
                <button type="submit" class="login-btn-submit">Sign In</button>
            </form>
        </div>
    </div>
`;

html = html.replace('<!-- ══════════════════════════════════════════════════════', loginHTML + '\n    <!-- ══════════════════════════════════════════════════════');

const loginJS = `
    // ─── LOGIN LOGIC ──────────────────────────────────────────────
    function handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const pw = document.getElementById('login-pw').value;
        const error = document.getElementById('login-error');
        const card = document.querySelector('.login-card');
        
        if (email === 'farmer@agrosense.io' && pw === 'demo123') {
            document.body.classList.add('logged-in');
            error.classList.remove('show');
            window.scrollTo(0, 0);
            showToast('Logged in successfully');
        } else {
            error.classList.add('show');
            card.classList.remove('shake');
            void card.offsetWidth; // trigger reflow
            card.classList.add('shake');
        }
    }
    
    function handleLogout() {
        document.body.classList.remove('logged-in');
        document.body.classList.remove('dashboard-view');
        window.scrollTo(0, 0);
        showToast('Logged out');
    }
`;

html = html.replace('// ─── PAGE ROUTING ────────────────────────────────────────────', loginJS + '\n    // ─── PAGE ROUTING ────────────────────────────────────────────');

// Also update the dashboard back button to go to landing properly, or add a logout button.
// For now let's just add a logout near the refresh button
html = html.replace('<button class="d-btn d-btn-outline" onclick="refreshData()">↻ Refresh</button>',
                    '<button class="d-btn d-btn-error" style="border: 1px solid #f87171; color: #f87171; background: transparent; padding: 7px 14px; border-radius: 8px; font-family: var(--font); font-size: 11px; font-weight: 700; cursor: pointer; transition: all 0.2s; margin-right: 6px;" onmouseover="this.style.background=\'rgba(248,113,113,0.1)\'" onmouseout="this.style.background=\'transparent\'" onclick="handleLogout()">Logout</button>\n                    <button class="d-btn d-btn-outline" onclick="refreshData()">↻ Refresh</button>');

fs.writeFileSync('index.html', html, 'utf8');
console.log('Login injected.');
