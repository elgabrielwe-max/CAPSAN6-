export const session={token:localStorage.getItem('capsan_token')||'',user:null};
export function setToken(token){session.token=token||'';token?localStorage.setItem('capsan_token',token):localStorage.removeItem('capsan_token');}
export async function api(url,options={}){const headers={...(options.headers||{})};if(session.token)headers.authorization=`Bearer ${session.token}`;if(options.body&&!(options.body instanceof FormData)&&typeof options.body!=='string'){headers['content-type']='application/json';options.body=JSON.stringify(options.body);}const response=await fetch(url,{...options,headers});const type=response.headers.get('content-type')||'';const data=type.includes('application/json')?await response.json():await response.text();if(!response.ok)throw new Error(data?.error||data||`Error ${response.status}`);return data;}
async function fileResponse(url){const response=await fetch(url,{headers:session.token?{authorization:`Bearer ${session.token}`}:{}});if(!response.ok){let msg='No se pudo obtener el archivo';try{msg=(await response.json()).error||msg;}catch{}throw new Error(msg);}return response;}
export async function download(url,fileName){const response=await fileResponse(url);const blob=await response.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=fileName;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
export async function preview(url,fileName,mimeType=''){
  const viewable=String(mimeType||'').startsWith('image/')||String(mimeType||'').includes('pdf')||/\.(pdf|png|jpe?g|webp)$/i.test(String(fileName||''));
  if(!viewable)return download(url,fileName);
  const popup=window.open('about:blank','_blank');
  try{
    const response=await fileResponse(url);const blob=await response.blob();const objectUrl=URL.createObjectURL(blob);
    if(!popup)throw new Error('El navegador bloqueó la vista previa. Habilita las ventanas emergentes para CAPSAN6.');
    popup.document.title=fileName||'Archivo CAPSAN6';popup.location.href=objectUrl;setTimeout(()=>URL.revokeObjectURL(objectUrl),120000);
  }catch(error){if(popup)popup.close();throw error;}
}
