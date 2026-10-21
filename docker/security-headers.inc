# Security headers (frontend plan T12), included in every location: nginx drops server-level add_header lines in
# any location that adds its own, so they live here once.
# style-src needs 'unsafe-inline': Angular and NG-ZORRO add component styles at run time. Scripts stay 'self' only.
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; frame-src blob:" always;
add_header Referrer-Policy "no-referrer" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
add_header Permissions-Policy "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), serial=()" always;
# Ignored by browsers over plain HTTP; takes effect once the site is served over HTTPS.
add_header Strict-Transport-Security "max-age=31536000" always;
