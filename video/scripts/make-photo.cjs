/* Makes scripts/assets/lesson-plan.jpg: a stand-in "photo" of a handwritten lesson-plan page,
   used as the proof photo in the recording. Run once: node scripts/make-photo.cjs */
const path = require('path');
const { chromium } = require(require('path').join(__dirname, '../../app/node_modules/playwright-core'));
(async () => {
  const b = await chromium.launch({ channel: 'chrome', headless: true });
  const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  await p.setContent(`<html><body style="margin:0;background:#6b5a48;display:grid;place-items:center;height:100vh">
  <div style="width:900px;height:760px;transform:rotate(-2.5deg);background:repeating-linear-gradient(#fdfbf3 0 38px,#b9cde3 38px 40px);
   box-shadow:0 20px 40px rgba(0,0,0,.45);padding:40px 60px;box-sizing:border-box;font-family:'Kohinoor Devanagari','Devanagari Sangam MN',sans-serif;color:#1d3d8f;border-left:4px solid #e08a8a">
   <div style="font-size:40px;font-weight:600;margin-bottom:18px">पाठ योजना · कक्षा 3 · शब्द पठन</div>
   <div style="font-size:30px;line-height:40px">दिनांक: 24/10/2026<br>1. चित्र दिखाकर शब्द पहचान (10 मिनट)<br>2. अक्षर जोड़कर शब्द बनाना — कमल, नल, घर<br>
   3. समूह में पठन, स्तर अनुसार (15 मिनट)<br>4. हर बच्चे से 5 शब्द पढ़वाना<br>उपस्थित: 28 / 31<br><br><span style="font-size:26px">ह० प्रधानाध्यापिका</span></div></div></body></html>`);
  await p.screenshot({ path: path.join(__dirname, 'assets/lesson-plan.jpg'), type: 'jpeg', quality: 85 });
  await b.close();
})();
