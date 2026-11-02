const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const chrome=fs.readFileSync('src/components/suite/chrome.tsx','utf8');
const session=fs.readFileSync('src/lib/auth/session.ts','utf8');
test('integrated HUD retains top profile, dismissible menu and owner verification',()=>{
 assert.match(chrome,/aria-expanded=\{menu === "profile"\}/);
 assert.match(chrome,/useDismiss/);
 assert.match(chrome,/href="\/admin\/profile"/);
 assert.match(chrome,/user.email/);
 assert.match(session,/getAuthorizedOwner/);
});
