import test from 'node:test';
import assert from 'node:assert/strict';
import {validateApplication,can,allowedTransition} from './domain.mjs';

const input={
 prefix:'นาย',firstName:'ผู้สมัคร',lastName:'ตัวอย่าง',phone:'0812345678',
 address:'123',district:'ตำบลตัวอย่าง',amphoe:'อำเภอตัวอย่าง',province:'จังหวัดตัวอย่าง',zipcode:'84000',
 guardianName:'ผู้ปกครองทดสอบ',relationship:'บิดา',guardianPhone:'0891112233',
 school:'สถานศึกษาทดสอบ',gpa:'3.50',level:'ปวช.',major:'ตัวอย่างสาขา A'
};
test('valid applicant accepted',()=>assert.equal(validateApplication(input,['ตัวอย่างสาขา A']).valid,true));
test('missing required field rejected',()=>assert.equal(validateApplication({...input,firstName:''}).errors.firstName,'REQUIRED'));
test('invalid phone rejected',()=>assert.equal(validateApplication({...input,phone:'123'}).errors.phone,'INVALID_FORMAT'));
test('invalid GPA rejected',()=>assert.equal(validateApplication({...input,gpa:'4.5'}).errors.gpa,'INVALID_FORMAT'));
test('closed major rejected',()=>assert.equal(validateApplication(input,['ตัวอย่างสาขา B']).errors.major,'NOT_OPEN'));
test('viewer cannot modify applications',()=>assert.equal(can('Viewer','applications.update'),false));
test('only owner manages staff',()=>{assert.equal(can('Owner','staff.manage'),true);assert.equal(can('Admin','staff.manage'),false);});
test('department staff cannot view other department',()=>{assert.equal(can('DepartmentStaff','applications.departmentRead',false),false);assert.equal(can('DepartmentStaff','applications.departmentRead',true),true);});
test('allowed status transition',()=>{assert.equal(allowedTransition('submitted','reviewing'),true);assert.equal(allowedTransition('approved','submitted'),false);});

test('no published majors fails closed',()=>assert.equal(validateApplication(input,[]).errors.major,'NOT_OPEN'));
test('department user cannot read all applications',()=>assert.equal(can('DepartmentStaff','applications.read',false),false));
test('department user may read assigned applications',()=>assert.equal(can('DepartmentStaff','applications.read',true),true));
