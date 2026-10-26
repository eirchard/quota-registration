# ระบบรับสมัครเรียนรอบโควตา V2

เวอร์ชันเริ่มต้น (MVP) – GitHub + Cloudflare Workers + Google Apps Script + **Google Sheets เดิม**

> **สถานะ**: โค้ดต้นแบบพร้อมนำไปติดตั้ง/ทดสอบ ยังไม่ได้เชื่อมกับบัญชี Cloudflare, Deploy Apps Script หรือเปิดรับสมัครจริง

## โครงสร้าง

- `index.html`: หน้าแบบฟอร์มสมัครเรียน, เข้าสู่ระบบ, Dashboard, จัดการใบสมัคร, จัดการเจ้าหน้าที่, ตั้งค่าระบบ
- `worker.js`: Cloudflare Worker รับหน้า `index.html` จาก GitHub และให้ API ฝั่งเดียวกัน (`/api/...`), จัดการคุกกี้และรหัสผ่าน
- `Code.gs`: Google Apps Script รับเฉพาะ API request ที่มี `BACKEND_SECRET` แล้วอ่าน/เขียน Google Sheets
- `wrangler.toml`: กำหนด Worker และ URL สำหรับดึงไฟล์ HTML จาก GitHub

การเปิดเว็บไซต์จริงควรเป็น `https://quota-registration-v2.<your-subdomain>.workers.dev` (หรือ Custom Domain ของคุณ) ไม่ใช่ลิงก์ `/exec` หรือ GitHub Pages โดยตรง เพราะการ Login และส่งฟอร์มใช้ `/api/` ของ Cloudflare Worker.

## ขั้นที่ 1: เตรียม Google Sheets และ Google Apps Script

1. ใช้ Spreadsheet **เดิม** ได้เลย โดย **สำรองข้อมูลก่อน** และจด Spreadsheet ID จาก URL; แนะนำเริ่มด้วยสำเนาทดสอบก่อน
2. สร้างโปรเจกต์ Google Apps Script **ใหม่** เพื่อไม่กระทบระบบรับสมัครรุ่นเก่า (ไม่ต้องลบ `Code.gs` เดิม)
3. วางเนื้อหา `Code.gs` ในโปรเจกต์ใหม่นี้
4. เปิด **Project Settings → Script Properties** เพิ่มรายการ:
   - `SHEET_ID` = Spreadsheet ID เดิม (ตัวอย่างจากระบบก่อน: `1c3Z59VVixCAZOXK6kEXfJg9bcHHgV9SIy5qloB3JqIw` ตรวจว่าเป็นไฟล์ที่ต้องการจริง)
   - `BACKEND_SECRET` = รหัสสุ่มยาวอย่างน้อย 40–64 ตัวอักษร สร้างขึ้นใหม่และเก็บไว้เฉพาะเจ้าของระบบ
5. เลือกฟังก์ชัน `setupSystem` แล้วกด **Run** ครั้งเดียว อนุญาตสิทธิ์ Google Sheets ตามที่ Google ขอ
6. ตรวจว่ามีแท็บใหม่ `QRV2_Applications`, `QRV2_Staff`, `QRV2_Settings`, `QRV2_Audit` ในไฟล์เดิม (ระบบ **ไม่แก้ข้อมูลชีตแรกเก่า**)
7. Deploy → New deployment → **Web app** → **Execute as: Me** → **Who has access: Anyone** แล้วคัดลอก URL `/exec`
8. ต้องเข้าผ่าน URL Deployment ใหม่ ไม่มี `/u/0/` หรือ `/u/1/` ปะปน หาก Access Anyone ไม่พร้อมต้องแก้การตั้งค่า Google Account/Workspace ก่อน

**ข้อควรทราบ:** Apps Script Web App ต้องเปิดให้ Cloudflare Worker ส่งคำขอได้ (`Anyone`) แต่ทุกคำขอใน `doPost` ต้องมี Secret จึงจะเข้าถึงข้อมูลได้ และห้ามเก็บ Secret ไว้ใน HTML หรือ Repository สาธารณะ

## ขั้นที่ 2: เก็บหน้าเว็บไซต์ใน GitHub

Repository ที่คุณสร้างแล้ว: https://github.com/eirchard/quota-registration

1. **สำรอง** `index.html` เก่าไว้ก่อน และเก็บไฟล์ V2 ในโฟลเดอร์ `v2/` แทนการทับระบบเดิม
2. นำ `index.html` เวอร์ชันนี้ขึ้น GitHub ในโฟลเดอร์ `v2/` (เพื่อไม่ทับ `index.html` เก่า)
3. ตรวจว่า URL raw เปิดได้: `https://raw.githubusercontent.com/eirchard/quota-registration/main/v2/index.html` หากเก็บบน branch `v2` ให้เปลี่ยน `/main/` เป็น `/v2/` ทั้งใน Worker และ `wrangler.toml`
4. โค้ด `Code.gs` ควรเก็บในโปรเจกต์ Google Apps Script ฝั่งเจ้าของ ไม่แนะนำอัปโหลดรวมบน GitHub สาธารณะ

## ขั้นที่ 3: สร้าง Cloudflare Worker

### แบบใช้ Cloudflare Dashboard (ไม่ต้องลงโปรแกรม)

1. เข้า Cloudflare Dashboard → Workers & Pages → Create Worker ตั้งชื่อ `quota-registration-v2`
2. กด Edit code และแทนเนื้อหาด้วย `worker.js` จากแพ็กนี้ → Deploy
3. เปิด Settings → Variables and Secrets (หรือเมนู Variables ของ Worker) แล้วเพิ่มค่า:

| ชื่อ | ประเภท | ค่า |
|---|---|---|
| `GITHUB_INDEX_URL` | Text | `https://raw.githubusercontent.com/eirchard/quota-registration/main/v2/index.html` |
| `GAS_ENDPOINT` | Secret | URL `/exec` ที่คัดลอกจาก Apps Script ใหม่ |
| `BACKEND_SECRET` | Secret | ต้องตรงกับ Script Properties ใน Apps Script |
| `SESSION_SECRET` | Secret | สุ่มรหัสลับยาว 40–64 ตัวอักษรคนละค่ากับ BACKEND_SECRET |
| `SETUP_KEY` | Secret | รหัสสำหรับสร้าง Owner ครั้งแรก คนละค่ากับรหัสอื่น |

4. บันทึก Secret ทั้งหมด และ Deploy อีกครั้งหาก Dashboard กำหนด
5. เปิด `https://quota-registration-v2.<your-subdomain>.workers.dev/health` จะขึ้น `{"ok":true,...}`
6. เปิดหน้าเว็บผ่าน URL `/` ของ Worker; หน้า GitHub raw และ GitHub Pages **ไม่ใช่ลิงก์ที่ประชาชนใช้สมัครโดยตรง**

### แบบ CLI (ทางเลือก)

ใช้ `wrangler.toml`:

```bash
npx wrangler login
npx wrangler secret put GAS_ENDPOINT
npx wrangler secret put BACKEND_SECRET
npx wrangler secret put SESSION_SECRET
npx wrangler secret put SETUP_KEY
npx wrangler deploy
```

Secrets ต้องเก็บใน Cloudflare Secrets ไม่ใช่ตัวแปรข้อความสาธารณะ และ **ไม่ควร commit `.dev.vars` / `.env`**

## ขั้นที่ 4: สร้าง Owner และตั้งค่ารับสมัคร

1. เปิด URL Cloudflare Worker แล้วกด **สำหรับเจ้าหน้าที่**
2. เมื่อยังไม่มี Owner ระบบจะแสดง **ตั้งค่าเจ้าของระบบครั้งแรก**
3. ใส่ `SETUP_KEY`, ชื่อที่แสดง, Username (อังกฤษ/ตัวเลข 3 ตัวขึ้นไป) และรหัสผ่านอย่างน้อย 12 อักขระ
4. สมัคร Owner สำเร็จแล้ว Login ใหม่
5. ไปที่ **ตั้งค่าระบบ** → ตรวจชื่อสถานศึกษา ปีการศึกษา สาขา ข้อความนโยบายข้อมูลส่วนบุคคล
6. เมื่อพร้อมจริงจึงเปลี่ยนสถานะเป็น **เปิดรับสมัคร**

## สิทธิ์ (ตรวจสอบฝั่ง Apps Script ทุกครั้ง ไม่เชื่อคำสั่งจากหน้าเว็บ)

| สิทธิ์ | Owner | Admin | Staff | Viewer |
|---|---|---|---|---|
| Dashboard / ดูใบสมัคร | ✔ | ✔ | ✔ | ✔ |
| เปลี่ยนสถานะใบสมัคร | ✔ | ✔ | ✔ | – |
| ตั้งค่ารับสมัคร/ข้อมูลหน้าเว็บ | ✔ | ✔ | – | – |
| เพิ่ม/เปิดปิด/เปลี่ยนสิทธิ์เจ้าหน้าที่ | ✔ | – | – | – |

รหัสผ่านถูกแฮชที่ Cloudflare ด้วย PBKDF2-SHA256 (160,000 iterations, salt สุ่ม) และระบบใช้ Session Cookie HttpOnly Secure SameSite=Strict อายุ 8 ชั่วโมง มีการตรวจสถานะบัญชีใน Sheets ทุกคำขอ Admin

## เช็กลิสต์ทดสอบก่อนเปิดให้ประชาชน

1. `/health` ตอบสำเร็จ
2. `/` แสดงหน้าเว็บจาก GitHub และโลโก้ placeholder/ชื่อสถานศึกษาแสดงถูกต้อง
3. `/api/config` ตอบค่าจาก Google Sheets
4. สร้าง Owner ได้ครั้งเดียว Login ได้ และ Logout แล้วเข้าหน้า Admin ไม่ได้
5. เพิ่ม Admin, Staff, Viewer แล้วทดสอบสิทธิ์แต่ละบัญชี
6. Viewer เปลี่ยนสถานะไม่ได้ และ Staff ตั้งค่าระบบไม่ได้ (ทดสอบ API ด้วย ไม่ใช่แค่ปุ่มซ่อน)
7. เมื่อปิดรับสมัคร หน้าเว็บไม่มีฟอร์มส่งใบสมัคร
8. เปิดรับสมัครชั่วคราว ส่งข้อมูล **ทดสอบ** แล้วตรวจใน `QRV2_Applications`
9. เปลี่ยนสถานะผู้สมัครแล้วเช็กใน Google Sheets และ `QRV2_Audit`
10. ดูใน Google Sheets ว่าชีตใบสมัครเก่าไม่ได้ถูกเขียนทับ
11. ทดสอบมือถือ การส่งซ้ำ เครือข่ายช้า และบัญชี Google หลายบัญชี

## ข้อจำกัดและสิ่งที่ควรพัฒนาก่อนใช้งานจริงจำนวนมาก

- ยังไม่ติดตั้ง Cloudflare Turnstile/Rate Limiting สำหรับป้องกันสแปมและ bot ปริมาณมาก; ควรเพิ่มก่อนเปิดใช้จริง
- ยังไม่มีระบบแก้ไขหรือรีเซ็ตรหัสผ่านด้วยตัวเอง; เจ้าหน้าที่ Owner ยังไม่มีหน้าจอรีเซ็ตรหัสผ่านเวอร์ชันนี้ (อาจเพิ่มในระยะถัดไป)
- หน้า Admin แสดงรายการใบสมัครล่าสุด **สูงสุด 300 รายการ**, Dashboard นับจาก Sheets ทั้งหมด; ควรทำ pagination/server-side search หากผู้สมัครมาก
- ระบบยังไม่อ่านหรือย้ายรายการผู้สมัครจากชีตเก่าเข้า V2; เก็บข้อมูลใหม่ใน `QRV2_Applications` เพื่อไม่ให้กระทบของเดิม
- ต้องมีคำชี้แจง PDPA/ระยะเวลาเก็บข้อมูลและการจัดการสิทธิ์ตามนโยบายจริงของวิทยาลัยก่อนใช้ข้อมูลผู้สมัครจริง
- ชื่อสาขา `เทคโนโลยีธุรกิจดิจิทัล` เป็นค่าเริ่มต้นสำหรับทดสอบ **ไม่ใช่รายชื่อเปิดสอน/รับสมัครที่ได้รับการยืนยัน** ให้ Owner แก้ไขก่อนเปิดรับสมัคร
- บริการ Cloudflare Free และ Google Apps Script มีข้อจำกัดด้านโควตาและอาจเปลี่ยนได้ การใช้งานจริงควรทดสอบโหลดและโควตาล่วงหน้า

## วิธีทำให้แก้หน้าเว็บแล้วอัปเดตทันที

แก้ `index.html` บน GitHub; Cloudflare Worker จะดึงไฟล์จาก `raw.githubusercontent.com` (กำหนดแคชไว้ 60 วินาที) จึงไม่ต้อง Deploy Apps Script ใหม่เมื่อแก้แค่ HTML/CSS/JS แต่ถ้าเปลี่ยน Worker หรือ Code.gs ต้อง Deploy โค้ดส่วนนั้นด้วย

## ลิงก์อ้างอิง

- Google Apps Script Web Apps: https://developers.google.com/apps-script/guides/web
- Google Apps Script Content Service: https://developers.google.com/apps-script/guides/content
- Cloudflare Web Crypto: https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
- Cloudflare Worker Secrets: https://developers.cloudflare.com/workers/configuration/secrets/