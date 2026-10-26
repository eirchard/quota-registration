# Quota Registration V2.1 — Staging Deployment Guide

**สถานะ: ไม่ได้ Deploy และไม่เคยเชื่อมข้อมูลจริง** คำแนะนำนี้ทำเฉพาะบัญชีทดสอบและ Google Sheets **สำเนา** เท่านั้น

## ขอบเขตที่พัฒนาแล้ว
- `index.staging.html` — ฟอร์มสมัครพร้อมข้อมูลที่อยู่/ผู้ปกครอง และ Admin บางส่วน
- `worker.staging.js` — Cloudflare Worker แยก endpoint + session + API สำหรับดูรายละเอียด/history
- `Code.staging.gs` — Google Apps Script ที่บังคับใช้ Spreadsheet ชื่อมี `STAGING`, `TEST` หรือ `ทดสอบ`
- `domain.mjs` และ `domain.test.mjs` — กฎ validation/roles สเปกระยะถัดไป (ยังไม่ผูกกับ backend ที่ Deploy)

**คำเตือน:** นี่เป็น build สำหรับ staging ไม่ใช่ production-ready: ยังไม่มี Turnstile, rate limiting ที่ edge, server-side pagination, password reset, full role scoping, durable email/notification หรือ UAT. อย่านำข้อมูลส่วนบุคคลจริงมาทดสอบ

## ตั้งค่าเฉพาะสภาพแวดล้อมทดสอบ

1. **สร้าง Google Sheets STAGING สำเร็จแล้ว** ชื่อ `Quota Registration V2.1 STAGING` อยู่ที่ https://docs.google.com/spreadsheets/d/1QlDW3VNLXd2ZVXzcn7xCSf706Icb01iLxMKQTIiuS_s/edit (5 แท็บพร้อมหัวคอลัมน์ และ `admissionsOpen=false`). ไม่ต้องสร้างชีตใหม่และห้ามใช้ชีต Production.
2. สร้าง Google Apps Script **ใหม่** แล้ววาง `Code.staging.gs` ใน `Code.gs` ของสคริปต์ใหม่ (อย่าแทน Code.gs ของ Production).
3. Script Properties:
   - `SHEET_ID` — `1QlDW3VNLXd2ZVXzcn7xCSf706Icb01iLxMKQTIiuS_s` (ชีตทดสอบที่สร้างแล้วเท่านั้น; โค้ดตรวจ ID นี้ด้วย)
   - `BACKEND_SECRET` — Secret ใหม่ยาวอย่างน้อย 40 ตัวอักษร ไม่ใช้ค่าระบบจริง
4. Run `setupSystem()` แล้วตรวจการสร้างแท็บ `QRV21_Applications`, `QRV21_Staff`, `QRV21_Settings`, `QRV21_Audit`, `QRV21_ApplicationHistory`.
5. Deploy Web App ทดสอบ `Execute as Me` และ `Who has access Anyone`. การเปิดแบบ Anyone ยังต้องใช้ BACKEND_SECRET ให้ถูกต้องทุกคำขอ; อย่าเผยแพร่ secrets
6. สร้าง Cloudflare Worker ใหม่ เช่น `quota-registration-v21-staging` (อย่าใช้ Worker V2 Production) ใส่เนื้อหา `worker.staging.js`.
7. กำหนด Worker Variables/Secrets:

| ชื่อ | ประเภท | ค่า |
|---|---|---|
| STAGING_ONLY | Text | `true` |
| GITHUB_INDEX_URL | Text | `https://raw.githubusercontent.com/eirchard/quota-registration/refs/heads/develop/v2.1/v2.1/index.staging.html` |
| GAS_ENDPOINT | Secret | URL `/exec` ของ Apps Script สำหรับทดสอบ |
| BACKEND_SECRET | Secret | ค่าเดียวกับใน Script Properties **ของ Staging เท่านั้น** |
| SESSION_SECRET | Secret | รหัสสุ่มใหม่ยาวอย่างน้อย 40 ตัวอักษร |
| SETUP_KEY | Secret | รหัสสุ่มใหม่ใช้เฉพาะสร้าง Owner Staging |

8. **อย่าใช้ Cloudflare Workers Production หรือ Secret ของ V2 เดิม**. Deploy Worker ทดสอบ แล้วเปิด `/health` ก่อน ตามด้วย `/api/config` และ `/api/setup-status`. ทดสอบสร้าง Owner **เฉพาะ Staging** หลังยืนยันว่าไม่มี Owner อยู่แล้ว
9. ตรวจ `admissionsOpen=false` ในแท็บ `QRV21_Settings` ก่อนเปิดหน้าฟอร์ม เมื่อพร้อมทดสอบด้วยข้อมูลสมมติ ค่อยเปิดรับสมัคร **เฉพาะ staging** และปิดอีกครั้งหลังทดสอบ

## Test plan ขั้นต่ำ
- ฟอร์มปฏิเสธช่องที่จำเป็น เบอร์ผิด รหัสไปรษณีย์ผิด สาขาที่ไม่ได้เปิด และ consent=false
- ส่งซ้ำด้วย idempotencyKey เดิมแล้วได้เลขอ้างอิงเดิม (ไม่มีแถวเพิ่ม)
- Admin ดู detail/history ได้เมื่อ login, Viewer เปลี่ยน status ไม่ได้
- เปลี่ยนสถานะแล้วมีรายการ `QRV21_ApplicationHistory` และ `QRV21_Audit`
- ตรวจว่า Cloudflare Worker production และชีตผู้สมัครจริงไม่ถูกแก้ไข
- ทดสอบ API permission โดยตรง ไม่ใช่แค่คลิก UI
- ทดสอบจำนวนรายการสูง, ความเร็ว, โควตา Google Apps Script ก่อนใช้งานจริง

## ข้อจำกัดเชิงสถาปัตยกรรมที่ต้องปรับต่อก่อนปล่อย Production
- Worker และ Apps Script ใช้ shared secret กันในการอนุญาตคำขอจาก Worker; ชื่อ role ที่ปรากฏใน `domain.mjs` ยังไม่ enforce ครบทุก role ใน Code.staging.gs
- การเพิ่มเจ้าหน้าที่มีเพียง Owner/Admin/Staff/Viewer ใน Backend staging ชุดนี้
- รายการผู้สมัครใน Admin ยังแสดงสูงสุด 300 รายการ ไม่รองรับ server-side paging
- `index.staging.html` มีตัวนำทาง wizard 4 ขั้นตอนสำหรับทดสอบ ส่วน `prototype.html` เป็น sandbox demo อีกหน้า; ต้องทำ UAT บนอุปกรณ์จริงก่อนใช้ Production
- ข้อมูลส่วนตัวต้องมี PDPA retention schedule และการกำหนดสิทธิ์การส่งออกข้อมูลก่อนเปิดจริง
- ลิงก์ GitHub ของ staging เป็นเพียง source code; เว็บไซต์ต้องเข้าผ่าน URL Cloudflare Worker ของ staging

**ห้ามนำ `Code.staging.gs` ไปแทน Code.gs ระบบจริงหรือชี้ `SHEET_ID` ไปยังชีตจริง**
