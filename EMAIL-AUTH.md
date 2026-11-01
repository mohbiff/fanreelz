# Email authentication

Email/password sign-in uses the existing Supabase Auth project and accounts. Public registration and reset-email requests are gated by EMAIL_SIGNUP_ENABLED=true in the Worker environment. Leave it unset until custom SMTP is configured, email confirmations remain enabled, the site redirect URLs allow https://fanreelz.com/, and verification/recovery have been tested with an external email provider. Google and Discord stay available.

Recovery callbacks listen for Supabase PASSWORD_RECOVERY before opening the password-update form. Account creation requires consent and matching passwords. Credentials never enter public profile records. Display names are user content and never used for authorization.

Run node --test tests/email-auth.test.cjs. The UI can test existing review credentials without creating a new account. Update Google Play account creation declarations when enabling the UI.
