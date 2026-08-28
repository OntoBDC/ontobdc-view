(function (global) {
  "use strict";
  const lifecycle=global.OntoBDCAnnotationLifecycle;
  const model=global.OntoBDCAnnotationModel;
  const values=value=>Array.isArray(value)?value:value==null?[]:[value];
  const center=selector=>{if(!selector)return null;if(Array.isArray(selector.points)&&selector.points.length){const p=selector.points[0];return{x:p.x,y:p.y};}if(Number.isFinite(selector.x))return{x:selector.x+selector.width/2,y:selector.y+selector.height/2};return null;};
  const intersects=(a,b)=>a&&b&&Number.isFinite(a.x)&&Number.isFinite(b.x)&&a.x<=b.x+b.width&&b.x<=a.x+a.width&&a.y<=b.y+b.height&&b.y<=a.y+a.height;
  const close=(a,b)=>{const ac=center(a),bc=center(b);return ac&&bc&&Math.hypot(ac.x-bc.x,ac.y-bc.y)<=0.12;};

  function spatialClusters(annotations) {
    const byRepresentation=new Map(),without=[];
    annotations.forEach(a=>{if(!a.selector){without.push(a);return;}const key=a.representationSource||a.logicalSource;if(!key){without.push(a);return;}if(!byRepresentation.has(key))byRepresentation.set(key,[]);byRepresentation.get(key).push(a);});
    const groups=[];
    byRepresentation.forEach((items,representation)=>{
      const pending=items.slice();
      while(pending.length){const cluster=[pending.shift()];for(let i=pending.length-1;i>=0;i--){if(cluster.some(a=>close(a.selector,pending[i].selector)||intersects(a.selector,pending[i].selector))){cluster.push(pending.splice(i,1)[0]);}}groups.push({representation,annotations:cluster});}
    });
    if(without.length)groups.push({representation:null,annotations:without});
    return groups;
  }

  const CSS = "ontobdc-subject-page";
  const CATEGORY_SLUG_BY_LOCAL_NAME = {
    NoteAnnotation: "note",
    IssueAnnotation: "issue",
    ClassificationAnnotation: "classification",
    LocationAnnotation: "location",
    RecordAnnotation: "record",
  };
  function localName(uri) {
    if (model && typeof model.localName === "function") return model.localName(uri);
    return String(uri || "").split(/[#/]/).pop();
  }
  function categorySlug(type) {
    return CATEGORY_SLUG_BY_LOCAL_NAME[localName(type)] || "note";
  }
  // Small stroke-based icon set, one consistent 20x20 grid, matching the
  // tool's other inline-SVG chrome (onto-logo-tile.js, onto-theme-tile.js).
  const ICON_SVG = {
    up: '<path d="M4 12L10 6L16 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    down: '<path d="M4 8L10 14L16 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    space: '<rect x="3" y="3" width="6" height="6" rx="1.4" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="11" y="3" width="6" height="14" rx="1.4" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="3" y="11" width="6" height="6" rx="1.4" stroke="currentColor" stroke-width="1.6" fill="none"/>',
    timeline: '<circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M10 6V10L13 12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/>',
    people: '<circle cx="7.5" cy="7" r="2.6" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M2.8 16c.5-2.8 2.4-4.3 4.7-4.3s4.2 1.5 4.7 4.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/><circle cx="14.5" cy="7.6" r="2.1" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12.6 11.9c1.9-.4 3.7.6 4.6 2.9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/>',
  };
  function icon(name, size) {
    const span = document.createElement("span");
    span.innerHTML = `<svg width="${size||15}" height="${size||15}" viewBox="0 0 20 20">${ICON_SVG[name]}</svg>`;
    return span.firstElementChild;
  }
  function initials(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  }

  function createPage(configuration){
    const options=Object.assign({annotations:[],threads:[],threadId:null,labels:{},onOpen:function(){},onCreateThread:null},configuration||{});
    const hash=new URLSearchParams(location.hash.slice(1));
    let active=hash.get("tab")||"space",selectedAnnotation=hash.get("annotation");
    let currentThreadId=options.threadId!=null?options.threadId:hash.get("thread");
    let creatingThread=false;
    const root=document.createElement("article");root.className=CSS;

    function threadById(id){
      if(id==null)return{id:null,label:options.labels.unassigned||"Unassigned threads",description:""};
      return options.threads.find(s=>s.id===id)||{id,label:null,description:""};
    }
    function annotationsFor(id){
      return options.annotations.filter(a=>id?values(a.threads).includes(id):!values(a.threads).length);
    }
    function switchThread(id){currentThreadId=id;selectedAnnotation=null;render();}
    function switchTab(name){active=name;render();}

    function item(a,snippetLabel){
      const category=categorySlug(a.type);
      const b=document.createElement("button");
      b.type="button";
      b.className=`${CSS}-item ${CSS}-cat-border-${category}`;
      b.dataset.annotationId=a.id;
      b.setAttribute("aria-current",String(a.id===selectedAnnotation));
      const badge=document.createElement("span");badge.className=`${CSS}-cat ${CSS}-cat-${category}`;
      badge.textContent=options.labels.categoryLabels&&options.labels.categoryLabels[localName(a.type)]||localName(a.type);
      const body=document.createElement("span");body.className=`${CSS}-item-body`;
      const snippet=document.createElement("span");snippet.className=`${CSS}-item-snippet`;snippet.textContent=snippetLabel||a.body||a.id;
      body.append(snippet);
      b.append(badge,body);
      b.onclick=()=>{selectedAnnotation=a.id;writeHash();options.onOpen(a);};
      return b;
    }
    function itemMeta(el,text){const meta=document.createElement("span");meta.className=`${CSS}-item-meta`;meta.textContent=text;el.querySelector(`.${CSS}-item-body`).append(meta);return el;}
    function itemPrefix(el,text){const snippet=el.querySelector(`.${CSS}-item-snippet`);const tag=document.createElement("span");tag.className=`${CSS}-role-tag`;tag.textContent=text;snippet.prepend(tag);return el;}

    function buildThreadCreator(){
      const wrapper=document.createElement("div");wrapper.className=`${CSS}-create`;
      const toggle=document.createElement("button");toggle.type="button";toggle.className=`${CSS}-create-toggle`;
      toggle.textContent=(creatingThread?"– ":"+ ")+(options.labels.newThread||"New thread");
      toggle.onclick=()=>{creatingThread=!creatingThread;render();};
      wrapper.append(toggle);
      if(creatingThread){
        const form=document.createElement("div");form.className=`${CSS}-create-form`;
        const name=document.createElement("input");name.type="text";name.placeholder=options.labels.threadName||"Name";name.className=`${CSS}-create-name`;
        const description=document.createElement("input");description.type="text";description.placeholder=options.labels.threadDescription||"Description";description.className=`${CSS}-create-description`;
        const confirm=document.createElement("button");confirm.type="button";confirm.className=`${CSS}-create-confirm`;confirm.textContent=options.labels.createThread||"Create";
        const error=document.createElement("small");error.className=`${CSS}-create-error`;error.hidden=true;
        confirm.onclick=async()=>{
          const label=name.value.trim();
          if(!label){name.focus();return;}
          if(typeof options.onCreateThread!=="function")return;
          confirm.disabled=true;
          try{
            const thread=await options.onCreateThread(label,description.value.trim());
            if(thread&&thread.id){
              if(!options.threads.some(t=>t.id===thread.id))options.threads.push(thread);
              creatingThread=false;
              currentThreadId=thread.id;
            }
            render();
          }catch(creationError){
            error.textContent=(creationError&&creationError.message)||String(creationError);
            error.hidden=false;
            confirm.disabled=false;
          }
        };
        form.append(name,description,confirm,error);
        wrapper.append(form);
      }
      return wrapper;
    }

    function buildSidebar(){
      const aside=document.createElement("aside");aside.className=`${CSS}-sidebar`;
      const eyebrow=document.createElement("p");eyebrow.className=`${CSS}-sidebar-eyebrow`;eyebrow.textContent=options.labels.threads||"Threads";
      const list=document.createElement("div");list.className=`${CSS}-list`;
      const entries=[threadById(null)].concat(options.threads);
      entries.forEach(s=>{
        const isActive=s.id===currentThreadId;
        const b=document.createElement("button");b.type="button";b.setAttribute("aria-pressed",String(isActive));
        const label=document.createElement("span");label.className=`${CSS}-item-label`;
        if(s.label){label.textContent=s.label;}
        else if(s.id==null){label.classList.add("is-unlabeled");label.textContent=options.labels.unassigned||"Unassigned threads";}
        else{label.classList.add("is-unlabeled");label.textContent=options.labels.unlabeled||"Unlabeled thread";}
        const count=document.createElement("span");count.className=`${CSS}-item-count`;count.textContent=String(annotationsFor(s.id).length);
        b.append(label,count);
        b.onclick=()=>switchThread(s.id);
        list.append(b);
      });
      aside.append(eyebrow,list);
      if(typeof options.onCreateThread==="function")aside.append(buildThreadCreator());
      return aside;
    }

    function buildHeader(thread,annotations){
      const header=document.createElement("header");header.className=`${CSS}-header`;
      const eyebrow=document.createElement("p");eyebrow.className=`${CSS}-eyebrow`;eyebrow.textContent=options.labels.thread||"Thread";
      const title=document.createElement("h1");title.className=`${CSS}-title`;
      if(thread.label){title.textContent=thread.label;}
      else if(thread.id==null){title.classList.add("is-unlabeled");title.textContent=options.labels.unassigned||"Unassigned threads";}
      else{title.classList.add("is-unlabeled");title.textContent=options.labels.unlabeled||"Unlabeled thread";}
      header.append(eyebrow,title);
      if(thread.description){const description=document.createElement("p");description.className=`${CSS}-description`;description.textContent=thread.description;header.append(description);}
      if(thread.id){
        const technical=document.createElement("div");technical.className=`${CSS}-technical`;
        const tag=document.createElement("span");tag.className=`${CSS}-technical-tag`;tag.textContent="ID";
        const code=document.createElement("code");code.textContent=thread.id;
        technical.append(tag,code);header.append(technical);
      }
      const people=new Set(),resources=new Set(),categories=new Set(),times=[];
      annotations.forEach(a=>{categories.add(a.type);[a.annotatedBy,a.modifiedBy,a.resolvedBy,(a.properties||{}).recordedBy].concat(values(a.assignedTo)).filter(Boolean).forEach(x=>people.add(x));[a.logicalSource,a.representationSource,(a.properties||{}).recordResource].filter(Boolean).forEach(x=>resources.add(x));[a.annotatedAt,a.created,a.modified,(a.properties||{}).recordedAt,(a.properties||{}).resolvedAt].filter(Boolean).forEach(x=>times.push(x));});
      const stats=document.createElement("div");stats.className=`${CSS}-stats`;
      const range=times.length?times.sort()[0]+" — "+times.sort().at(-1):"—";
      [[String(annotations.length),options.labels.annotationsStat||"Annotations"],
       [String(categories.size),options.labels.categoriesStat||"Categories"],
       [String(people.size),options.labels.peopleStat||"People"],
       [String(resources.size),options.labels.resourcesStat||"Resources"],
       [range,options.labels.rangeStat||"Range"]].forEach(([value,label])=>{
        const stat=document.createElement("div");stat.className=`${CSS}-stat`;
        const v=document.createElement("span");v.className=`${CSS}-stat-value`;v.textContent=value;
        const l=document.createElement("span");l.className=`${CSS}-stat-label`;l.textContent=label;
        stat.append(v,l);stats.append(stat);
      });
      header.append(stats);
      return header;
    }

    function buildTabs(){
      const nav=document.createElement("nav");
      [["space","space",options.labels.space||"Space"],["timeline","timeline",options.labels.timeline||"Timeline"],["people","people",options.labels.people||"People"]].forEach(([name,iconName,label])=>{
        const b=document.createElement("button");b.type="button";b.className=`${CSS}-tab`;
        b.setAttribute("aria-pressed",String(name===active));
        b.append(icon(iconName));b.append(document.createTextNode(label));
        b.onclick=()=>switchTab(name);
        b.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();switchTab(name);}};
        nav.appendChild(b);
      });
      return nav;
    }

    function renderSpace(panel,annotations){
      const groups=spatialClusters(annotations);
      if(!groups.length){panel.append(emptyState());return;}
      groups.forEach((cluster,index)=>{
        const group=document.createElement("div");group.className=`${CSS}-resource-group`;
        const heading=document.createElement("div");heading.className=`${CSS}-resource-heading`;
        const label=document.createElement("span");label.textContent=cluster.representation?(options.labels.spatialGroup||"Spatial group"):(options.labels.withoutPosition||"Without spatial position");
        heading.append(label);
        if(cluster.representation){const mono=document.createElement("span");mono.className="mono";mono.textContent=cluster.representation;heading.append(mono);}
        group.append(heading);
        const inner=document.createElement("div");inner.className=`${CSS}-cluster`;
        if(cluster.representation){const clusterLabel=document.createElement("span");clusterLabel.className=`${CSS}-cluster-label`;clusterLabel.textContent=(options.labels.spatialGroup||"Spatial group")+" "+(index+1);inner.append(clusterLabel);}
        cluster.annotations.forEach(a=>inner.append(item(a)));
        group.append(inner);panel.append(group);
      });
    }
    function renderTimeline(panel,annotations){
      const events=[];annotations.forEach(a=>(lifecycle?lifecycle.events(a):[]).forEach(event=>events.push({annotation:a,event})));
      events.sort((a,b)=>String(a.event.at).localeCompare(String(b.event.at)));
      if(!events.length){panel.append(emptyState());return;}
      const timeline=document.createElement("div");timeline.className=`${CSS}-timeline`;
      events.forEach(x=>{
        const row=document.createElement("div");row.className=`${CSS}-timeline-row`;
        const time=document.createElement("div");time.className=`${CSS}-timeline-time`;time.textContent=x.event.at;
        const rail=document.createElement("div");rail.className=`${CSS}-timeline-rail`;
        rail.append(el("div",`${CSS}-timeline-dot`),el("div",`${CSS}-timeline-line`));
        const card=item(x.annotation,x.annotation.body||x.annotation.id);
        itemMeta(card,options.labels[x.event.type]||x.event.type);
        row.append(time,rail,card);timeline.append(row);
      });
      panel.append(timeline);
    }
    function renderPeople(panel,annotations){
      const map=new Map();
      annotations.forEach(a=>{const p=a.properties||{},pairs=[[a.annotatedBy,"author"],[a.modifiedBy,"modifier"],[a.resolvedBy,"resolver"],[p.recordedBy,"recorder"]].concat(values(a.assignedTo).map(x=>[x,"assignee"]));pairs.forEach(pair=>{if(!pair[0])return;if(!map.has(pair[0]))map.set(pair[0],[]);map.get(pair[0]).push({annotation:a,role:pair[1]});});});
      if(!map.size){panel.append(emptyState());return;}
      map.forEach((entries,person)=>{
        const group=document.createElement("div");group.className=`${CSS}-people-group`;
        const heading=document.createElement("div");heading.className=`${CSS}-people-heading`;
        const avatar=document.createElement("span");avatar.className=`${CSS}-avatar`;avatar.textContent=initials(person);
        const name=document.createElement("span");name.className=`${CSS}-people-name`;name.textContent=person;
        heading.append(avatar,name);group.append(heading);
        entries.forEach(x=>{
          const card=item(x.annotation,x.annotation.body||x.annotation.id);
          itemPrefix(card,options.labels[x.role]||x.role);
          group.append(card);
        });
        panel.append(group);
      });
    }
    function el(tag,className){const e=document.createElement(tag);if(className)e.className=className;return e;}
    function emptyState(){const p=document.createElement("p");p.className=`${CSS}-empty`;p.textContent=options.labels.empty||"No annotations.";return p;}

    function writeHash(){const params=new URLSearchParams(location.hash.slice(1));params.set("thread",currentThreadId||"");params.set("tab",active);if(selectedAnnotation)params.set("annotation",selectedAnnotation);history.replaceState(null,"","#"+params.toString());}

    function render(){
      const thread=threadById(currentThreadId);
      const annotations=annotationsFor(currentThreadId);
      const detail=document.createElement("div");detail.className=`${CSS}-detail`;
      const tabs=buildTabs();
      const panel=document.createElement("div");panel.className=`${CSS}-panel`;
      if(active==="space")renderSpace(panel,annotations);
      else if(active==="timeline")renderTimeline(panel,annotations);
      else renderPeople(panel,annotations);
      detail.append(buildHeader(thread,annotations),tabs,panel);
      root.replaceChildren(buildSidebar(),detail);
      writeHash();
    }

    render();
    return Object.freeze({
      root,
      setActive:value=>{active=value;render();},
      getActive:()=>active,
      selectAnnotation:id=>{selectedAnnotation=id;render();},
      getSpatialClusters:()=>spatialClusters(annotationsFor(currentThreadId)),
    });
  }
  global.OntoBDCSubjectPage=Object.freeze({create:createPage,spatialClusters:spatialClusters});
}(globalThis));
