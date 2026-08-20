(function (global) {
  "use strict";
  async function sha256(text){const bytes=new TextEncoder().encode(text);const digest=await crypto.subtle.digest("SHA-256",bytes);return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");}
  async function read(handle){const file=await handle.getFile();const content=await file.text();return {content:content,revision:await sha256(content)};}
  async function writeAtomic(handle,content,expectedRevision,validate){
    const current=await read(handle);if(expectedRevision&&current.revision!==expectedRevision){throw new Error("The annotation dataset changed outside this page. Reload before saving.");}
    if(validate)validate(content);let writable;try{writable=await handle.createWritable({keepExistingData:true});await writable.write(content);await writable.close();}catch(error){if(writable)try{await writable.abort();}catch(ignore){}throw error;}
    const saved=await read(handle);if(saved.content!==content)throw new Error("The annotation dataset could not be verified after writing.");return saved;
  }
  function strictJson(content){const value=JSON.parse(content);if(!value||value.schemaVersion!==2||!Array.isArray(value.annotations))throw new TypeError("Invalid strict annotation dataset.");return value;}
  global.OntoBDCAnnotationPersistence=Object.freeze({read:read,writeAtomic:writeAtomic,strictJson:strictJson,sha256:sha256});
}(globalThis));
