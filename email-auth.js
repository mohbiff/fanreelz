(function (root) {
  'use strict';
  function createFlow(client, origin) {
    const redirect = origin + '/?email_auth=confirmed';
    return {
      async submit(mode, values) {
        const email = String(values.email || '').trim();
        const password = String(values.password || '');
        if (mode !== 'update' && (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error('Enter a valid email address.');
        if (mode !== 'reset' && !password) throw new Error('Enter your password.');
        if ((mode === 'signup' || mode === 'update') && password.length < 8) throw new Error('Use at least 8 characters for your password.');
        if ((mode === 'signup' || mode === 'update') && password !== values.confirm) throw new Error('The passwords do not match.');
        let result;
        if (mode === 'signin') result = await client.auth.signInWithPassword({email, password});
        else if (mode === 'signup') {
          if (!values.terms) throw new Error('Please accept the Terms and Privacy Policy to create an account.');
          const name = String(values.name || '').trim();
          if (!name || name.length > 60) throw new Error('Enter a display name of 1–60 characters.');
          result = await client.auth.signUp({email, password, options:{data:{name}, emailRedirectTo:redirect}});
        } else if (mode === 'reset') result = await client.auth.resetPasswordForEmail(email, {redirectTo:origin + '/?email_auth=recovery'});
        else if (mode === 'update') {
          if (!values.recovery) throw new Error('Open the password-reset link from your email first.');
          result = await client.auth.updateUser({password});
        } else throw new Error('Choose a sign-in option.');
        if (result.error) throw result.error;
        if (mode === 'signin' && !result.data?.session) throw new Error('Sign-in did not finish. Please try again.');
        return result.data || {};
      }
    };
  }
  function friendlyError(error) {
    const code = error?.code || '';
    if (code === 'invalid_credentials') return 'Email or password is incorrect. If you joined with Google or Discord, use that option or reset your password.';
    if (code === 'email_not_confirmed') return 'Confirm your email address before signing in. Check your inbox and spam folder.';
    if (['over_email_send_rate_limit','over_request_rate_limit'].includes(code)) return 'Too many attempts. Please wait a few minutes and try again.';
    if (code === 'email_address_not_authorized' || /only request this after|email address not authorized/i.test(error?.message || '')) return 'Email delivery is not ready yet. Please use Google or Discord for now.';
    return String(error?.message || 'Something went wrong. Please try again.').slice(0,220);
  }
  function open(options) {
    const {client, show, notify, origin = location.origin, signupEnabled = false} = options;
    const mode = options.mode || 'signin';
    const title = {signin:'Sign in with email',signup:'Create your account',reset:'Reset your password',update:'Choose a new password'}[mode];
    const action = {signin:'Sign in',signup:'Create account',reset:'Send reset email',update:'Save new password'}[mode];
    const newPassword = mode === 'signup' || mode === 'update';
    const unavailable = (mode === 'signup' || mode === 'reset') && !signupEnabled;
    show(`<div class="dlg emailauth" role="dialog" aria-modal="true" aria-label="${title}">
      <h2>${title}</h2>
      <p class="vmeta">${mode==='signin'?'Use your email address from any provider.':mode==='signup'?'Choose a display name. Your email stays private.':mode==='reset'?'We will email you a link to choose a new password.':'Enter your new password below.'}</p>
      ${unavailable?'<p role="status">Email verification and password-reset delivery are being set up. Please use Google or Discord to create an account for now.</p>':`<form id="emailAuthForm">
      ${mode==='signup'?'<label>Display name<input name="name" autocomplete="nickname" required maxlength="60"></label>':''}
      ${mode!=='update'?'<label>Email address<input name="email" type="email" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" required></label>':''}
      ${mode!=='reset'?`<label>Password<input name="password" type="password" autocomplete="${newPassword?'new-password':'current-password'}" ${newPassword?'minlength="8"':''} required></label>`:''}
      ${newPassword?'<label>Confirm password<input name="confirm" type="password" autocomplete="new-password" minlength="8" required></label><p class="vmeta">Use at least 8 characters.</p>':''}
      ${mode==='signup'?'<label class="emailterms"><input name="terms" type="checkbox" required><span>I am at least 13 (or the minimum age required where I live) and agree to the <a href="/terms.html" target="_blank" rel="noopener">Terms</a> and <a href="/privacy.html" target="_blank" rel="noopener">Privacy Policy</a>.</span></label>':''}
      <p id="emailAuthMessage" role="status" aria-live="polite"></p>
      <button class="btn" type="submit">${action}</button></form>`}
      <div class="row emailauthlinks">${mode==='signin'?'<button class="btn ghost" type="button" data-email-mode="signup">Create an account</button><button class="btn ghost" type="button" data-email-mode="reset">Forgot password?</button>':'<button class="btn ghost" type="button" data-email-mode="signin">Back to email sign-in</button>'}<button class="btn ghost" data-close type="button">Close</button></div>
    </div>`, event => {
      const next = event.target.closest('[data-email-mode]');
      if (next) open({...options,mode:next.dataset.emailMode});
    });
    if (unavailable) return;
    const form = document.getElementById('emailAuthForm');
    if (!form) return;
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (form.dataset.busy || !form.reportValidity()) return;
      const button = form.querySelector('[type="submit"]');
      const message = form.querySelector('#emailAuthMessage');
      const values = Object.fromEntries(new FormData(form));
      values.terms = !!values.terms; values.recovery = !!options.recovery;
      form.dataset.busy = '1'; button.disabled = true; button.textContent = 'Please wait…'; message.textContent = '';
      try {
        const data = await createFlow(client,origin).submit(mode,values);
        form.querySelectorAll('[type="password"]').forEach(input => {input.value='';});
        if (mode === 'signin' || (mode === 'signup' && data.session)) { notify('Signed in.'); location.reload(); return; }
        if (mode === 'update') { notify('Your password has been updated.'); history.replaceState(history.state,'',location.pathname); location.reload(); return; }
        message.textContent = mode === 'reset' ? 'If an account exists for that address, a password-reset email will arrive shortly. Check your spam folder too.' : 'Check your email to confirm your account, then return here to sign in. If you already have an account, sign in or reset your password.';
      } catch (error) { message.textContent = friendlyError(error); }
      finally { delete form.dataset.busy; button.disabled=false; button.textContent=action; }
    });
    form.querySelector('input')?.focus();
  }
  const api = {createFlow,friendlyError,open};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FanreelzEmailAuth = api;
})(typeof window !== 'undefined' ? window : globalThis);

