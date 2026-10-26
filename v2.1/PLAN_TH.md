# Quota Registration V2.1 — แผนพัฒนา (ฉบับเริ่มต้น)

> สถานะ: Development only • สาขา `develop/v2.1` • ห้าม Deploy ทับ Production โดยตรง

## หลักการ
- ใช้ V2 เดิมที่ทำงานแล้วเป็นฐาน: GitHub (frontend), Cloudflare Worker (API/session), Google Apps Script (business rules), Google Sheets (database)
- แยก frontend รับสมัคร / Admin / API contract ออกจากกัน; เผยแพร่แต่ละส่วนแยกได้
- ใช้ไฟล์ Google Sheets สำเนาสำหรับ staging; ห้ามนำข้อมูลส่วนบุคคลจริงเข้าระบบต้นแบบ
- `main/v2/index.html` และ Worker production ยังคงเดิมจนกว่าจะผ่าน UAT และอนุมัติปล่อยรุ่น
- ห้าม commit Secret, tokens, รหัสผ่าน หรือข้อมูลผู้สมัคร

## Roadmap และเงื่อนไขยอมรับ

| ลำดับ | ฟีเจอร์ | Acceptance criteria |
|---|---|---|
| P0 | ความปลอดภัย, สำรองข้อมูล, RBAC ฝั่ง Backend | ปฏิเสธ API ที่ไม่รับอนุญาต, จำกัด login และ spam, เก็บ Audit, ไม่มีข้อมูลลับใน frontend |
| P1 | ฟอร์มหลายขั้นตอน | ข้อมูลส่วนตัว / ที่อยู่ / ผู้ปกครอง / การศึกษา / สาขา / สรุปก่อนส่ง; validation ทั้ง client และ backend |
| P1 | Admin รายการผู้สมัคร | pagination server-side, search/filter, รายละเอียด, status history, export ตามสิทธิ์ |
| P1 | Dashboard | จำนวนรวม, แยกสถานะ ระดับ สาขา ช่วงเวลา; ข้อมูลตรงกับ Sheets |
| P1 | Roles | Owner, Admin, Registrar, DepartmentStaff, Viewer; ทดสอบ deny ทุก endpoint |
| P2 | เลขอ้างอิง / ติดตามสถานะ | ออกเลขไม่ซ้ำ, ค้นหาแบบไม่เผยข้อมูลอ่อนไหว, ป้องกันการเดา |
| P2 | พิมพ์ PDF / แจ้งเตือน | ต้องตรวจข้อกำหนดเอกสารและความยินยอมก่อน |
| P3 | ตั้งค่า dynamic forms | ตั้งปีการศึกษา รอบรับสมัคร สาขา วันเปิดปิด เกณฑ์รับสมัคร โดยไม่ Deploy frontend |

## รูปแบบข้อมูลรุ่นใหม่ (ร่าง)
แนะนำชีตใหม่แยกจาก V2 ที่เปิดจริง:
- `QRV21_Applications`: applicationId, submittedAt, status, applicant fields, consentVersion, revision, updatedAt
- `QRV21_Guardians`: applicationId, relationship, contact fields
- `QRV21_ApplicationHistory`: eventId, applicationId, actorId, action, previousStatus, newStatus, timestamp
- `QRV21_Staff`: id, role, assignedDepartment, active, auth version (ข้อมูล authentication ควรแยกจาก Sheets เมื่อระบบขยาย)
- `QRV21_Settings`: admissionCycle, openAt, closeAt, departments, formConfigVersion
- `QRV21_Audit`: traceId, actor, action, target, timestamp (ไม่บันทึก secrets)

**Migration:** ไม่เปลี่ยนหัวคอลัมน์ชีต V2 เดิม; ต้องทำ mapping, backup, ตรวจจำนวนแถวและ rollback plan ก่อน migrate

## API contract เป้าหมาย (ยังไม่ Deploy)
- GET `/api/v2.1/public/config`
- POST `/api/v2.1/applications` (idempotency key, Turnstile, server validation)
- GET `/api/v2.1/admin/summary?from=&to=`
- GET `/api/v2.1/admin/applications?page=&q=&status=`
- GET `/api/v2.1/admin/applications/:id`
- PATCH `/api/v2.1/admin/applications/:id/status`
- GET/POST/PATCH `/api/v2.1/admin/staff` (Owner only)
ทุก endpoint ต้อง enforce permission ที่ฝั่ง server; `actorId` ต้องมาจาก session ที่ตรวจสอบแล้ว ไม่ใช่รับจาก request body แบบเชื่อถือได้

## กระบวนการทำงาน
1. สร้างต้นแบบหน้า UI บน branch นี้ (ไม่มี API ต่อจริง)
2. อนุมัติฟิลด์และ workflow รับสมัครกับผู้ใช้งาน
3. ทำ backend และ database migration บน staging
4. ทดสอบ automated API + role matrix + end-to-end กับข้อมูลจำลอง
5. UAT: เจ้าหน้าที่ทะเบียนและแผนกร่วมทดสอบ
6. สำรอง production, วาง deployment และ rollback, แล้วจึง merge/release

## จุดที่ต้องตัดสินใจ
- ปีการศึกษา, สาขา, ระดับ และฟิลด์บังคับรับสมัครจริง
- เจ้าหน้าที่ประจำสาขาเห็นข้อมูลได้ระดับใด
- นโยบาย PDPA, การเก็บรักษา และสิทธิ์แก้ไขข้อมูลผู้สมัคร
- วิธีตรวจสอบสถานะผู้สมัครที่ไม่เปิดเผย PII


## ความคืบหน้า Implementation (2026-10-27)
- [x] แยก branch `develop/v2.1` ไม่เปลี่ยน production
- [x] เพิ่มต้นแบบ wizard 5 ขั้นตอน และหน้า Admin ข้อมูลจำลอง (`prototype.html`)
- [x] ตรวจช่องบังคับ / เบอร์โทร / รหัสไปรษณีย์ / GPA ในต้นแบบ
- [x] เพิ่ม domain module (`domain.mjs`): validate application, RBAC, state transition
- [x] เพิ่ม unit test definitions (`domain.test.mjs`)
- [ ] รัน unit tests ใน CI และตรวจผ่านจริง
- [ ] เชื่อม validation เข้ากับ backend ที่มีการตรวจสิทธิ์และ payload server-side
- [ ] สร้าง staging Apps Script + Google Sheets สำเนา
- [ ] เพิ่ม pagination, dashboard aggregation, audit history, idempotency, rate limiting และ Turnstile
- [ ] E2E/UAT ด้วยข้อมูลจำลอง, ตรวจ PDPA, สำรอง/rollback ก่อนปล่อยจริง

### การรันทดสอบเมื่อ checkout branch
```bash
node --test v2.1/domain.test.mjs
```

**หมายเหตุ** ไฟล์ `prototype.html` ใช้ข้อมูลจำลองและไม่ส่งข้อมูลไปฐานข้อมูล. `domain.mjs` ยังเป็น shared design/test module ไม่ได้เชื่อมกับ Google Apps Script ที่ Deploy อยู่.
