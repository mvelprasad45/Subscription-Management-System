const $ = id => document.getElementById(id);
const forms = { in: $('signin'), up: $('signup'), fp: $('forgot') };
const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function show(name) {
    Object.entries(forms).forEach(([k, f]) => f.hidden = k !== name);
    $('tabIn').setAttribute('aria-selected', name === 'in');
    $('tabUp').setAttribute('aria-selected', name === 'up');
}
$('tabIn').onclick = () => show('in');
$('tabUp').onclick = () => show('up');
$('toForgot').onclick = e => { e.preventDefault(); show('fp'); };
$('backIn').onclick = e => { e.preventDefault(); show('in'); };

document.querySelectorAll('.eye').forEach(b => b.onclick = () => {
    const i = $(b.dataset.toggle), hide = i.type === 'password';
    i.type = hide ? 'text' : 'password';
    b.textContent = hide ? 'Hide' : 'Show';
});

// Password rules: more than 8 chars, upper, lower, special
function checks(p) {
    return { len: p.length > 8, up: /[A-Z]/.test(p), low: /[a-z]/.test(p), sp: /[^A-Za-z0-9]/.test(p) };
}
$('suPass').addEventListener('input', () => {
    const c = checks($('suPass').value);
    document.querySelectorAll('#rules li').forEach(li => li.classList.toggle('met', c[li.dataset.r]));
});

function flag(input, bad) { input.classList.toggle('bad', bad); return bad; }
function say(el, text, ok) { el.textContent = text; el.classList.toggle('ok', !!ok); }

// SIGN IN
forms.in.onsubmit = e => {
    e.preventDefault();
    const em = $('siEmail'), pw = $('siPass');
    if (flag(em, !emailOk(em.value.trim()))) return say($('siMsg'), 'Enter a valid email address.');
    if (flag(pw, !pw.value)) return say($('siMsg'), 'Enter your password.');
    say($('siMsg'), 'Signing in...', true);
    /* TODO: POST /api/auth/login {email, password}
       The server returns the user's role (admin | staff | customer). Then redirect:
       admin -> /admin/dashboard, staff -> /staff/dashboard, customer -> /portal */
};

// SIGN UP
forms.up.onsubmit = e => {
    e.preventDefault();
    const n = $('suName'), em = $('suEmail'), pw = $('suPass'), cf = $('suConf');
    if (flag(n, !n.value.trim())) return say($('suMsg'), 'Enter your name.');
    if (flag(em, !emailOk(em.value.trim()))) return say($('suMsg'), 'Enter a valid email address.');
    const c = checks(pw.value);
    if (flag(pw, !Object.values(c).every(Boolean))) return say($('suMsg'), 'Password does not meet all the rules.');
    if (flag(cf, cf.value !== pw.value)) return say($('suMsg'), 'Passwords do not match.');
    say($('suMsg'), 'Creating account...', true);
    /* TODO: POST /api/auth/register {name, email, password}
       The server must reject a duplicate email and always create the user with role = customer. */
};

// FORGOT PASSWORD
forms.fp.onsubmit = e => {
    e.preventDefault();
    const em = $('fpEmail');
    if (flag(em, !emailOk(em.value.trim()))) return say($('fpMsg'), 'Enter a valid email address.');
    say($('fpMsg'), 'If this email is registered, a reset link has been sent.', true);
    /* TODO: POST /api/auth/forgot-password {email} */
};
