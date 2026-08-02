export const CAPABILITIES = Object.freeze({
  MASTER: [
    'dashboard:view','training:manage','training:grade','training:report','rac:view','rac:create','rac:import','rac:followup','rac:validate','rac:assign','rac:purge',
    'masterdata:manage','users:manage','users:impersonate','environment:view','environment:manage','ssoma:manage','incidents:manage','reports:executive','drive:sync'
  ],
  SSOMA: [
    'dashboard:view','training:manage','training:grade','training:report','rac:view','rac:create','rac:import','rac:followup','rac:validate','rac:assign',
    'environment:view','environment:manage','ssoma:manage','incidents:manage','reports:executive'
  ],
  SUPERVISOR: [
    'dashboard:view','training:grade','training:report','rac:view','rac:create','rac:import','rac:followup','environment:view','incidents:manage','reports:executive'
  ],
});

export const hasCapability = (role, capability) => (CAPABILITIES[role] || []).includes(capability);
