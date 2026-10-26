/**
 * Quota Registration V2.1 - Staging-only shared validation.
 * This module contains NO real applicant data, backend secrets, or network requests.
 * Use in development/tests; GAS adapter must validate again on every API write.
 */
export const STATUS = Object.freeze(["submitted","reviewing","needs_correction","approved","rejected"]);
export const ROLE = Object.freeze(["Owner","Admin","Registrar","DepartmentStaff","Viewer"]);
export const APPLICATION_FIELDS = Object.freeze({
 prefix:{required:true,max:15,options:["นาย","นางสาว","นาง"]},
 firstName:{required:true,max:80}, lastName:{required:true,max:80},
 phone:{required:true,pattern:/^0[0-9]{9}$/},
 address:{required:true,max:200},district:{required:true,max:100},
 amphoe:{required:true,max:100},province:{required:true,max:100},
 zipcode:{required:true,pattern:/^[0-9]{5}$/},
 guardianName:{required:true,max:160}, relationship:{required:true,max:60},
 guardianPhone:{required:true,pattern:/^0[0-9]{9}$/},
 school:{required:true,max:200},gpa:{required:false,pattern:/^(?:[0-3](?:\.[0-9]{1,2})?|4(?:\.0{1,2})?)$/},
 level:{required:true,options:["ปวช.","ปวส."]},major:{required:true,max:150}
});
export function validateApplication(payload,allowedMajors=[]) {
  const errors={};const normalized={};
  if(!payload||typeof payload!=="object"||Array.isArray(payload))return {valid:false,errors:{_:"INVALID_BODY"},data:null};
  for(const [key,rule] of Object.entries(APPLICATION_FIELDS)){
    const value=String(payload[key]??"").trim();
    if(rule.required&&!value){errors[key]="REQUIRED";continue;}
    if(value&&rule.max&&value.length>rule.max){errors[key]="TOO_LONG";continue;}
    if(value&&rule.pattern&&!rule.pattern.test(value)){errors[key]="INVALID_FORMAT";continue;}
    if(value&&rule.options&&!rule.options.includes(value)){errors[key]="INVALID_OPTION";continue;}
    normalized[key]=value;
  }
  if(normalized.major&&allowedMajors.length&&!allowedMajors.includes(normalized.major))errors.major="NOT_OPEN";
  return {valid:Object.keys(errors).length===0,errors,data:Object.keys(errors).length?null:normalized};
}
export function can(role,permission,departmentMatch=false) {
  if(!ROLE.includes(role))return false;
  const matrix={
    "applications.read":["Owner","Admin","Registrar","DepartmentStaff","Viewer"],
    "applications.update":["Owner","Admin","Registrar"],
    "applications.departmentRead":["Owner","Admin","Registrar","DepartmentStaff"],
    "dashboard.read":["Owner","Admin","Registrar","DepartmentStaff","Viewer"],
    "settings.update":["Owner","Admin"],
    "staff.manage":["Owner"]
  };
  if(!matrix[permission]?.includes(role))return false;
  if(role==="DepartmentStaff"&&(permission==="applications.departmentRead"||permission==="dashboard.read"))return departmentMatch;
  return true;
}
export function allowedTransition(from,to) {
  const transitions={
    submitted:["reviewing","needs_correction"],
    reviewing:["needs_correction","approved","rejected"],
    needs_correction:["reviewing"],
    approved:[],
    rejected:[]
  };
  return !!transitions[from]?.includes(to);
}
