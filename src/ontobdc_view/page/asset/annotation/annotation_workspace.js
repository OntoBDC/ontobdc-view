(function (global) {
  "use strict";
  const lifecycle = global.OntoBDCAnnotationLifecycle;
  const local = value => { const s=String(value||""); return s.slice(Math.max(s.lastIndexOf("#"),s.lastIndexOf("/"))+1); };
  const values = value => Array.isArray(value) ? value : value == null ? [] : [value];
  const dateValue = value => value ? Date.parse(value) : NaN;

  function personRoles(annotation) {
    const p=annotation.properties||{}, roles=[];
    [[annotation.annotatedBy,"author"],[annotation.modifiedBy,"modifier"],[annotation.resolvedBy,"resolver"],[p.recordedBy,"recorder"]]
      .forEach(pair=>{if(pair[0])roles.push({uri:pair[0],role:pair[1]});});
    values(annotation.assignedTo).forEach(uri=>roles.push({uri:uri,role:"assignee"}));
    return roles;
  }

  function createWorkspace(configuration) {
    const options=Object.assign({annotations:[],visualResolver:null,onOpen:function(){},onSelect:function(){},labels:{}},configuration||{});
    let annotations=options.annotations.slice(), filters={}, selectedId=null;
    const root=document.createElement("section"); root.className="ontobdc-annotation-workspace";
    const summary=document.createElement("div"); summary.className="ontobdc-annotation-workspace-summary";
    const legend=document.createElement("div"); legend.className="ontobdc-annotation-workspace-legend"; legend.setAttribute("aria-label",options.labels.legend||"Legend");
    const list=document.createElement("div"); list.className="ontobdc-annotation-workspace-list"; list.setAttribute("role","list");
    const detail=document.createElement("aside"); detail.className="ontobdc-annotation-workspace-detail";
    root.append(summary,legend,list,detail);

    function match(a) {
      const p=a.properties||{}, roles=personRoles(a), times=[a.annotatedAt,a.created,a.modified,p.recordedAt,p.resolvedAt].map(dateValue).filter(Number.isFinite);
      if(filters.category&&local(a.type)!==local(filters.category))return false;
      if(filters.issueStatus&&local(p.issueStatus)!==local(filters.issueStatus))return false;
      if(filters.issueKind&&local(p.issueKind)!==local(filters.issueKind))return false;
      if(filters.recordKind&&local(p.recordKind)!==local(filters.recordKind))return false;
      if(filters.locationKind&&local(p.locationKind)!==local(filters.locationKind))return false;
      if(filters.thread&&!values(a.threads).includes(filters.thread))return false;
      if(filters.person&&!roles.some(x=>x.uri===filters.person))return false;
      if(filters.personRole&&!roles.some(x=>x.role===filters.personRole&&(!filters.person||x.uri===filters.person)))return false;
      if(filters.logicalSource&&a.logicalSource!==filters.logicalSource)return false;
      if(filters.representationSource&&a.representationSource!==filters.representationSource)return false;
      if(filters.workStream&&a.workStream!==filters.workStream)return false;
      if(filters.relatedDimension&&a.relatedDimension!==filters.relatedDimension)return false;
      if(filters.resource&&a.logicalSource!==filters.resource&&p.recordResource!==filters.resource)return false;
      if(filters.hasGeometry!=null&&Boolean(a.selector)!==Boolean(filters.hasGeometry))return false;
      if(filters.dateFrom&&!times.some(t=>t>=dateValue(filters.dateFrom)))return false;
      if(filters.dateTo&&!times.some(t=>t<=dateValue(filters.dateTo)))return false;
      return true;
    }

    function counts(items) {
      const categories={}, statuses={}, records={};
      items.forEach(a=>{const category=local(a.type),p=a.properties||{};categories[category]=(categories[category]||0)+1;if(category==="IssueAnnotation"){const status=local(p.issueStatus);statuses[status]=(statuses[status]||0)+1;}if(category==="RecordAnnotation"){const kind=local(p.recordKind);records[kind]=(records[kind]||0)+1;}});
      return {total:items.length,categories:categories,issueStatuses:statuses,recordKinds:records,withoutGeometry:items.filter(a=>!a.selector).length,withoutThread:items.filter(a=>!values(a.threads).length).length,openIssues:statuses.Open||0,inProgressIssues:statuses.InProgress||0,resolvedIssues:statuses.Resolved||0};
    }

    function renderLegend(items) {
      legend.replaceChildren(); if(!options.visualResolver)return;
      const seen=new Set(); items.forEach(a=>{const key=local(a.type)+"|"+local((a.properties||{}).issueStatus||"");if(seen.has(key))return;seen.add(key);const contract=options.visualResolver.resolve ? options.visualResolver.resolve(a) : options.visualResolver(a);if(!contract)return;const entry=document.createElement("span");entry.className="ontobdc-annotation-workspace-legend-item";const swatch=document.createElement("i");swatch.dataset.shape=contract.shape||"";swatch.style.setProperty("--annotation-color",contract.color||contract.stroke||"currentColor");entry.append(swatch,document.createTextNode(options.labels[local(a.type)]||local(a.type)));legend.append(entry);});
    }

    function selectAnnotation(id){selectedId=id;render();const a=annotations.find(x=>x.id===id);if(a)options.onSelect(a);}
    function render(){
      const items=annotations.filter(match),c=counts(items);
      summary.textContent=(options.labels.total||"Total")+": "+c.total+" · "+(options.labels.openIssues||"Open issues")+": "+c.openIssues+" · "+(options.labels.inProgressIssues||"In progress")+": "+c.inProgressIssues+" · "+(options.labels.resolvedIssues||"Resolved")+": "+c.resolvedIssues+" · "+(options.labels.withoutGeometry||"Without geometry")+": "+c.withoutGeometry+" · "+(options.labels.withoutThread||"Without Thread")+": "+c.withoutThread;
      renderLegend(items); list.replaceChildren();
      items.forEach(a=>{const b=document.createElement("button");b.type="button";b.className="ontobdc-annotation-workspace-item";b.dataset.annotationId=a.id;b.setAttribute("role","listitem");b.setAttribute("aria-pressed",String(a.id===selectedId));b.textContent=(options.labels[local(a.type)]||local(a.type))+" — "+(a.body||a.id);b.onclick=()=>selectAnnotation(a.id);b.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();selectAnnotation(a.id);}};list.appendChild(b);});
      const selected=items.find(a=>a.id===selectedId);detail.replaceChildren();
      if(selected){const h=document.createElement("h3");h.textContent=selected.body||selected.id;const meta=document.createElement("pre");meta.textContent=JSON.stringify({type:local(selected.type),properties:selected.properties||{},threads:selected.threads||[],people:personRoles(selected),events:lifecycle?lifecycle.events(selected):[]},null,2);const open=document.createElement("button");open.type="button";open.textContent=options.labels.open||"Open";open.onclick=()=>options.onOpen(selected);detail.append(h,meta,open);}
    }
    function setAnnotations(value){annotations=values(value).slice();render();}
    function setFilters(value){filters=Object.assign({},value||{});render();}
    function clearSelection(){selectedId=null;render();}
    function openAnnotation(value){const a=typeof value==="string"?annotations.find(x=>x.id===value):value;if(a)options.onOpen(a);}
    function refresh(){render();}
    render();
    return Object.freeze({root,setAnnotations,setFilters,selectAnnotation,clearSelection,openAnnotation,refresh,getVisible:()=>annotations.filter(match),getCounts:()=>counts(annotations.filter(match)),getFilters:()=>Object.assign({},filters)});
  }
  global.OntoBDCAnnotationWorkspace=Object.freeze({create:createWorkspace,personRoles:personRoles});
}(globalThis));
